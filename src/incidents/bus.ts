import { atom } from "jotai";
import { uid } from "@/lib/ids";
import { appStore } from "@/store/store";
import { runbookFor } from "./runbooks";
import type {
  Attempt,
  Incident,
  IncidentInput,
  IncidentStatus,
  RemediationId,
  Severity,
} from "./types";

const MAX_INCIDENTS = 200;
/** Repeats of the same failure inside this window fold into one entry. */
const FOLD_WINDOW_MS = 10_000;

export const incidentsAtom = atom<Incident[]>([]);

export const openIncidentsAtom = atom((get) =>
  get(incidentsAtom).filter(
    (incident) => incident.status === "open" || incident.status === "mitigating",
  ),
);

export const latestIncidentAtom = atom((get) => get(incidentsAtom)[0] ?? null);

type BusEvent =
  | { type: "opened"; incident: Incident }
  | { type: "repeated"; incident: Incident }
  | { type: "updated"; incident: Incident }
  | { type: "resolved"; incident: Incident }
  | { type: "attempt"; incident: Incident; attempt: Attempt };

type Listener = (event: BusEvent) => void;

const listeners = new Set<Listener>();

export function subscribeIncidents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(event: BusEvent): void {
  for (const listener of listeners) listener(event);
}

function write(next: Incident[]): void {
  appStore.set(incidentsAtom, next.slice(0, MAX_INCIDENTS));
}

export function getIncidents(): Incident[] {
  return appStore.get(incidentsAtom);
}

export function getIncident(id: string): Incident | undefined {
  return getIncidents().find((incident) => incident.id === id);
}

export function getOpenIncidents(): Incident[] {
  return appStore.get(openIncidentsAtom);
}

const DEFAULT_SEVERITY: Severity = "error";

export function reportIncident(input: IncidentInput): Incident {
  const now = Date.now();
  const runbook = runbookFor(input.kind);
  const fingerprint = input.fingerprint ?? `${input.kind}:${input.title}`;
  const list = getIncidents();

  const existing = list.find(
    (incident) =>
      incident.fingerprint === fingerprint &&
      incident.status !== "resolved" &&
      now - incident.updatedAt < FOLD_WINDOW_MS,
  );

  if (existing) {
    const folded: Incident = {
      ...existing,
      count: existing.count + 1,
      updatedAt: now,
      detail: input.detail,
      context: { ...existing.context, ...input.context },
    };
    write(list.map((incident) => (incident.id === existing.id ? folded : incident)));
    emit({ type: "repeated", incident: folded });
    return folded;
  }

  const incident: Incident = {
    id: uid("inc"),
    kind: input.kind,
    severity: input.severity ?? runbook?.severity ?? DEFAULT_SEVERITY,
    source: input.source,
    title: input.title,
    detail: input.detail,
    at: now,
    updatedAt: now,
    count: 1,
    fingerprint,
    context: input.context ?? {},
    scenarioId: input.scenarioId,
    status: "open",
    actions: input.actions ?? runbook?.preferredActions ?? ["retry"],
    attempts: [],
    acknowledged: false,
  };

  write([incident, ...list]);
  emit({ type: "opened", incident });
  return incident;
}

function patch(id: string, update: (incident: Incident) => Incident): Incident | undefined {
  const list = getIncidents();
  const current = list.find((incident) => incident.id === id);
  if (!current) return undefined;
  const next = { ...update(current), updatedAt: Date.now() };
  write(list.map((incident) => (incident.id === id ? next : incident)));
  return next;
}

export function setIncidentStatus(id: string, status: IncidentStatus, note?: string): void {
  const next = patch(id, (incident) => ({
    ...incident,
    status,
    context: note ? { ...incident.context, note } : incident.context,
  }));
  if (!next) return;
  emit({ type: status === "resolved" ? "resolved" : "updated", incident: next });
}

export function acknowledgeIncident(id: string): void {
  const next = patch(id, (incident) => ({ ...incident, acknowledged: true }));
  if (next) emit({ type: "updated", incident: next });
}

export function acknowledgeAll(): void {
  write(getIncidents().map((incident) => ({ ...incident, acknowledged: true })));
}

export function recordAttempt(
  id: string,
  actionId: RemediationId,
  outcome: "ok" | "failed",
  note?: string,
): void {
  const attempt: Attempt = { actionId, at: Date.now(), outcome, note };
  const next = patch(id, (incident) => ({
    ...incident,
    attempts: [...incident.attempts, attempt],
    status: outcome === "ok" ? "resolved" : "mitigating",
  }));
  if (!next) return;
  emit({ type: "attempt", incident: next, attempt });
  if (outcome === "ok") emit({ type: "resolved", incident: next });
}

/** Resolve every open incident matching a kind — used when a fault is lifted. */
export function resolveKind(kind: Incident["kind"], note: string): void {
  const list = getIncidents();
  let changed = false;
  const next = list.map((incident) => {
    if (incident.kind !== kind || incident.status === "resolved") return incident;
    changed = true;
    return {
      ...incident,
      status: "resolved" as IncidentStatus,
      updatedAt: Date.now(),
      context: { ...incident.context, note },
    };
  });
  if (!changed) return;
  write(next);
  for (const incident of next) {
    if (incident.kind === kind && incident.status === "resolved") {
      emit({ type: "resolved", incident });
    }
  }
}

export function resolveByScenario(scenarioId: string, note: string): void {
  const list = getIncidents();
  let changed = false;
  const next = list.map((incident) => {
    if (incident.scenarioId !== scenarioId || incident.status === "resolved") return incident;
    changed = true;
    return {
      ...incident,
      status: "resolved" as IncidentStatus,
      updatedAt: Date.now(),
      context: { ...incident.context, note },
    };
  });
  if (changed) write(next);
}

export function clearIncidents(): void {
  write([]);
}
