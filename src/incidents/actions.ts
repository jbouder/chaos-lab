import { atom } from "jotai";
import { armedScenarios, disarmAllScenarios, disarmScenario, getScenario } from "@/chaos/registry";
import { clearStorageBallast, resetSavedSettings, stopLeaking } from "@/chaos/runtimeState";
import { backoffDelay, sleep } from "@/lib/backoff";
import { apiBreaker } from "@/lib/circuitBreaker";
import { appStore } from "@/store/store";
import { clearOutbox, loadOutbox, outboxAtom } from "@/victim/api/outbox";
import { getQueryClient, provokeTraffic } from "@/victim/api/provoke";
import { feedClient } from "@/victim/feed/feedClient";
import { getIncidents, recordAttempt, resolveKind, setIncidentStatus } from "./bus";
import { getTrace } from "./networkTrace";
import type { Incident, RemediationId } from "./types";

export type ActionResult = { ok: boolean; note: string };

export type RemediationAction = {
  id: RemediationId;
  label: string;
  /** One line the model can read to decide whether this fits. */
  description: string;
  /** `safe` actions may be run automatically when the user allows it. */
  risk: "safe" | "disruptive";
  applies: (incident?: Incident) => boolean;
  run: (incident?: Incident) => Promise<ActionResult>;
};

/* --------------------------------------------------------- shared wiring */

/** Bumped to force panels to remount with fresh state. */
export const panelResetAtom = atom(0);
/** Set when re-authentication is needed; the shell renders the dialog. */
export const reauthOpenAtom = atom(false);
export const draftSavedAtom = atom<string | null>(null);

const RELOAD_GUARD_KEY = "chaos-lab:reload-guard";

function scenarioForIncident(incident?: Incident): string | null {
  if (!incident) return null;
  if (incident.scenarioId) return incident.scenarioId;
  const armed = armedScenarios();
  for (const entry of armed) {
    const definition = getScenario(entry.id);
    if (definition?.kind === incident.kind) return entry.id;
  }
  return null;
}

async function refetchAll(): Promise<void> {
  await provokeTraffic();
}

/* -------------------------------------------------------------- actions */

const ACTIONS: RemediationAction[] = [
  {
    id: "retry",
    label: "Retry now",
    description: "Re-run the failed requests once.",
    risk: "safe",
    applies: () => true,
    run: async () => {
      if (!apiBreaker.canRequest()) apiBreaker.probe();
      await refetchAll();
      return { ok: true, note: "Re-ran the active requests." };
    },
  },
  {
    id: "retryWithBackoff",
    label: "Retry with backoff",
    description:
      "Retry up to four times with exponential backoff and jitter, honouring any Retry-After header.",
    risk: "safe",
    applies: () => true,
    run: async (incident) => {
      const retryAfter = Number(incident?.context.retryAfterMs ?? 0);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const wait = attempt === 0 && retryAfter > 0 ? retryAfter : backoffDelay(attempt);
        await sleep(Math.min(wait, 20_000));
        apiBreaker.probe();
        await refetchAll();
        const stillFailing = getIncidents().some(
          (candidate) =>
            candidate.fingerprint === incident?.fingerprint &&
            candidate.status !== "resolved" &&
            Date.now() - candidate.updatedAt < 2000,
        );
        if (!stillFailing) {
          return { ok: true, note: `Recovered on attempt ${attempt + 1}.` };
        }
      }
      return { ok: false, note: "Still failing after four backed-off attempts." };
    },
  },
  {
    id: "cancelInflight",
    label: "Cancel pending requests",
    description: "Abort in-flight requests so the page stops waiting.",
    risk: "safe",
    applies: () => true,
    run: async () => {
      await getQueryClient()?.cancelQueries();
      return { ok: true, note: "Cancelled the in-flight requests." };
    },
  },
  {
    id: "reloadOnce",
    label: "Reload the page",
    description: "Reload once, guarded so a failure cannot cause a reload loop.",
    risk: "disruptive",
    applies: () => true,
    run: async () => {
      const previous = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
      if (Date.now() - previous < 20_000) {
        return {
          ok: false,
          note: "Skipped: the page already reloaded moments ago, and looping would not help.",
        };
      }
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
      window.location.reload();
      return { ok: true, note: "Reloading." };
    },
  },
  {
    id: "clearAppCache",
    label: "Clear app cache",
    description: "Drop cached responses and local ballast. Server data is untouched.",
    risk: "disruptive",
    applies: () => true,
    run: async () => {
      const cleared = clearStorageBallast();
      getQueryClient()?.clear();
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      resolveKind("quota-exceeded", "Storage was cleared.");
      await refetchAll();
      return { ok: true, note: `Cleared ${cleared} stored blocks and the query cache.` };
    },
  },
  {
    id: "resetPanelState",
    label: "Reset this panel",
    description: "Remount the affected panel with fresh state.",
    risk: "safe",
    applies: (incident) =>
      incident?.kind === "render-crash" || incident?.kind === "render-loop" || !incident,
    run: async () => {
      appStore.set(panelResetAtom, appStore.get(panelResetAtom) + 1);
      resolveKind("render-crash", "The panel was remounted.");
      resolveKind("render-loop", "The panel was remounted.");
      return { ok: true, note: "Remounted the panel with clean state." };
    },
  },
  {
    id: "resetSavedSettings",
    label: "Reset saved settings",
    description: "Restore stored preferences to defaults after exporting them.",
    risk: "disruptive",
    applies: (incident) => incident?.kind === "corrupt-state" || !incident,
    run: async () => {
      resetSavedSettings();
      resolveKind("corrupt-state", "Settings were reset to defaults.");
      return { ok: true, note: "Saved settings are back to defaults." };
    },
  },
  {
    id: "exportDiagnostics",
    label: "Copy diagnostics",
    description: "Copy a JSON bundle of recent incidents and network activity to the clipboard.",
    risk: "safe",
    applies: () => true,
    run: async (incident) => {
      const bundle = {
        capturedAt: new Date().toISOString(),
        incident: incident ?? null,
        recentIncidents: getIncidents().slice(0, 10),
        network: getTrace(25),
        armedScenarios: armedScenarios(),
        userAgent: navigator.userAgent,
      };
      const text = JSON.stringify(bundle, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        return { ok: true, note: "Diagnostics copied to the clipboard." };
      } catch {
        return { ok: false, note: "The browser blocked clipboard access." };
      }
    },
  },
  {
    id: "refreshSession",
    label: "Refresh session",
    description: "Ask the server for a fresh token without signing out.",
    risk: "safe",
    applies: (incident) =>
      incident?.kind === "session-expired" || incident?.kind === "clock-skew" || !incident,
    run: async () => {
      const response = await fetch("/api/session/refresh", { method: "POST" }).catch(() => null);
      if (response?.ok) {
        resolveKind("session-expired", "The session was renewed.");
        await refetchAll();
        return { ok: true, note: "Got a fresh session." };
      }
      appStore.set(reauthOpenAtom, true);
      return { ok: false, note: "The refresh was rejected — a new sign-in is needed." };
    },
  },
  {
    id: "saveDraftAndReauth",
    label: "Save draft and sign in",
    description: "Preserve the in-progress form, then open the sign-in dialog.",
    risk: "safe",
    applies: (incident) => incident?.kind === "session-expired" || !incident,
    run: async () => {
      appStore.set(draftSavedAtom, new Date().toISOString());
      appStore.set(reauthOpenAtom, true);
      return { ok: true, note: "Draft saved. Sign in and it will be restored." };
    },
  },
  {
    id: "replayOutbox",
    label: "Replay queued writes",
    description: "Send everything queued while offline, using idempotency keys.",
    risk: "safe",
    applies: () => true,
    run: async () => {
      const items = await loadOutbox();
      if (items.length === 0) return { ok: true, note: "The outbox is already empty." };
      if (!navigator.onLine) {
        return {
          ok: false,
          note: `Still offline — ${items.length} writes are holding in the queue.`,
        };
      }

      let sent = 0;
      for (const item of items) {
        const response = await fetch(item.path, {
          method: item.method,
          headers: { "Content-Type": "application/json", "Idempotency-Key": item.idempotencyKey },
          body: JSON.stringify(item.body),
        }).catch(() => null);
        if (response?.ok) sent += 1;
      }

      if (sent === items.length) {
        await clearOutbox();
        await refetchAll();
        return { ok: true, note: `Replayed ${sent} queued ${sent === 1 ? "write" : "writes"}.` };
      }
      return { ok: false, note: `Replayed ${sent} of ${items.length}; the rest are still queued.` };
    },
  },
  {
    id: "probeCircuit",
    label: "Probe the upstream",
    description: "Send a single request through the open circuit breaker to test recovery.",
    risk: "safe",
    applies: () => true,
    run: async () => {
      apiBreaker.probe();
      const response = await fetch("/api/health").catch(() => null);
      if (response?.ok) {
        apiBreaker.recordSuccess();
        await refetchAll();
        return { ok: true, note: "The probe succeeded; the breaker is closed again." };
      }
      apiBreaker.recordFailure();
      return { ok: false, note: "The probe failed; the breaker stays open." };
    },
  },
  {
    id: "switchToPolling",
    label: "Switch to polling",
    description: "Abandon the socket and fetch updates on an interval instead.",
    risk: "safe",
    applies: (incident) => incident?.kind === "feed-disconnected" || !incident,
    run: async () => {
      feedClient.switchToPolling();
      return { ok: true, note: "Now polling for updates every 6 seconds." };
    },
  },
  {
    id: "reconnectFeed",
    label: "Reconnect the feed",
    description: "Retry the realtime connection immediately instead of waiting for backoff.",
    risk: "safe",
    applies: (incident) => incident?.kind === "feed-disconnected" || !incident,
    run: async () => {
      const connected = feedClient.reconnectNow();
      return connected
        ? { ok: true, note: "Reconnecting now." }
        : { ok: false, note: "The connection is still being refused; backoff will keep trying." };
    },
  },
  {
    id: "runInWorker",
    label: "Run it in a worker",
    description: "Re-run the blocking task off the main thread so the interface stays responsive.",
    risk: "safe",
    applies: (incident) => incident?.kind === "main-thread-freeze" || !incident,
    run: async (incident) => {
      const durationMs = Number(incident?.context.durationMs ?? 1500);
      const worker = new Worker(new URL("../victim/workers/heavy.worker.ts", import.meta.url), {
        type: "module",
      });

      const result = await new Promise<number>((resolve) => {
        worker.onmessage = (event: MessageEvent<{ durationMs: number }>) =>
          resolve(event.data.durationMs);
        worker.postMessage({ durationMs });
      });

      worker.terminate();
      resolveKind("main-thread-freeze", "The same work ran off the main thread.");
      return {
        ok: true,
        note: `Ran the same ${(result / 1000).toFixed(1)}s of work in a worker. The interface never blocked.`,
      };
    },
  },
  {
    id: "stopLeaks",
    label: "Stop the leaking timers",
    description: "Clear the intervals that keep allocating and release what they held.",
    risk: "safe",
    applies: (incident) => incident?.kind === "memory-leak" || !incident,
    run: async () => {
      const { freedMb } = stopLeaking();
      await disarmScenario("memory-leak");
      resolveKind("memory-leak", "Leaking timers were cleared.");
      return { ok: true, note: `Cleared the timers and released about ${freedMb}MB.` };
    },
  },
  {
    id: "dedupeSubmits",
    label: "Remove the duplicate",
    description: "Collapse records that share a reference, keeping the original.",
    risk: "disruptive",
    applies: (incident) => incident?.kind === "duplicate-submit" || !incident,
    run: async () => {
      const response = await fetch("/api/shipments/dedupe", { method: "POST" }).catch(() => null);
      if (!response?.ok) return { ok: false, note: "The dedupe request failed." };
      const body = (await response.json()) as { removed: number };
      await refetchAll();
      resolveKind("duplicate-submit", "Duplicates were collapsed.");
      return {
        ok: true,
        note: `Removed ${body.removed} duplicate ${body.removed === 1 ? "record" : "records"}.`,
      };
    },
  },
  {
    id: "syncClock",
    label: "Correct the device clock",
    description: "Stand in for turning on automatic time synchronisation on the device.",
    risk: "safe",
    applies: (incident) => incident?.kind === "clock-skew" || !incident,
    run: async () => {
      await disarmScenario("clock-skew");
      resolveKind("clock-skew", "The device clock was corrected.");
      await refetchAll();
      return { ok: true, note: "Clock corrected and authentication is working again." };
    },
  },
  {
    id: "disarmScenario",
    label: "Stop this fault",
    description: "Disarm the chaos scenario that is causing this incident.",
    risk: "safe",
    applies: (incident) => Boolean(scenarioForIncident(incident)),
    run: async (incident) => {
      const id = scenarioForIncident(incident);
      if (!id) return { ok: false, note: "No armed scenario matches this incident." };
      await disarmScenario(id);
      if (incident) resolveKind(incident.kind, "The scenario was disarmed.");
      await refetchAll();
      return { ok: true, note: `Disarmed “${getScenario(id)?.title ?? id}”.` };
    },
  },
  {
    id: "disarmAll",
    label: "Stop everything",
    description: "Disarm every armed scenario and return the app to a healthy baseline.",
    risk: "safe",
    applies: () => armedScenarios().length > 0,
    run: async () => {
      const count = await disarmAllScenarios();
      stopLeaking();
      clearStorageBallast();
      await refetchAll();
      return { ok: true, note: `Disarmed ${count} ${count === 1 ? "scenario" : "scenarios"}.` };
    },
  },
];

const BY_ID = new Map(ACTIONS.map((action) => [action.id, action]));

export function getAction(id: RemediationId): RemediationAction | undefined {
  return BY_ID.get(id);
}

export function actionsFor(incident?: Incident): RemediationAction[] {
  const preferred = incident?.actions ?? [];
  const ordered = preferred
    .map((id) => BY_ID.get(id))
    .filter((action): action is RemediationAction => Boolean(action))
    .filter((action) => action.applies(incident));
  return ordered.length > 0
    ? ordered
    : ACTIONS.filter((action) => action.applies(incident)).slice(0, 3);
}

export function allActions(): RemediationAction[] {
  return ACTIONS;
}

/** Run an action and record the outcome against the incident it addresses. */
export async function runRemediation(
  id: RemediationId,
  incident?: Incident,
): Promise<ActionResult> {
  const action = BY_ID.get(id);
  if (!action) return { ok: false, note: `Unknown action “${id}”.` };

  if (incident) setIncidentStatus(incident.id, "mitigating");

  try {
    const result = await action.run(incident);
    if (incident) recordAttempt(incident.id, id, result.ok ? "ok" : "failed", result.note);
    return result;
  } catch (error) {
    const note = error instanceof Error ? error.message : "The action threw.";
    if (incident) recordAttempt(incident.id, id, "failed", note);
    return { ok: false, note };
  }
}

export function outboxCount(): number {
  return appStore.get(outboxAtom).length;
}
