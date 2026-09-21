import { reportIncident, resolveKind } from "@/incidents/bus";
import type { ScenarioDefinition } from "../registry";
import {
  clearStorageBallast,
  corruptSavedSettings,
  fillStorage,
  readSavedSettings,
  resetSavedSettings,
  setCrashPanel,
  setLoopPanel,
} from "../runtimeState";

export const runtimeScenarios: ScenarioDefinition[] = [
  {
    id: "render-crash",
    title: "Panel crash",
    category: "runtime",
    kind: "render-crash",
    severity: "error",
    symptom: "A widget throws while rendering and its error boundary catches it.",
    lesson:
      "Boundaries should be small. One crashed panel with a retry button beats a blank page with an apology.",
    arm: () => setCrashPanel(true),
    disarm: () => {
      setCrashPanel(false);
      resolveKind("render-crash", "The panel renders again.");
    },
  },
  {
    id: "unhandled-rejection",
    title: "Silent background failure",
    category: "runtime",
    kind: "unhandled-rejection",
    severity: "warning",
    oneShot: true,
    symptom: "A promise rejects with nobody listening. Nothing visibly changes.",
    lesson:
      "The dangerous failures are the quiet ones. Data goes stale while the interface keeps insisting everything is fine.",
    arm: () => {
      void Promise.reject(new Error("Background sync for lane forecasts failed: connection reset"));
    },
  },
  {
    id: "render-loop",
    title: "Runaway render",
    category: "runtime",
    kind: "render-loop",
    severity: "error",
    symptom: "An effect updates state that retriggers the effect, over and over.",
    lesson:
      "A render guard converts a frozen tab into a legible error. The real fix is usually a dependency being recreated every render.",
    arm: () => setLoopPanel(true),
    disarm: () => {
      setLoopPanel(false);
      resolveKind("render-loop", "The panel settled.");
    },
  },
  {
    id: "corrupt-state",
    title: "Corrupted saved settings",
    category: "runtime",
    kind: "corrupt-state",
    severity: "error",
    oneShot: true,
    symptom: "Stored preferences become malformed JSON and fail to load.",
    lesson:
      "Anything persisted can come back wrong. Parse defensively, and always offer an export before you offer a reset.",
    arm: () => {
      corruptSavedSettings();
      try {
        readSavedSettings();
      } catch (error) {
        reportIncident({
          kind: "corrupt-state",
          source: "storage",
          title: "Saved settings could not be read",
          detail: error instanceof Error ? error.message : "Stored preferences are malformed.",
          context: { key: "chaos-lab:settings" },
          fingerprint: "corrupt-state",
          scenarioId: "corrupt-state",
        });
      }
    },
    disarm: () => {
      resetSavedSettings();
      resolveKind("corrupt-state", "Settings were reset to defaults.");
    },
  },
  {
    id: "quota-exceeded",
    title: "Storage full",
    category: "runtime",
    kind: "quota-exceeded",
    severity: "error",
    oneShot: true,
    symptom: "Writing to local storage throws QuotaExceededError.",
    lesson:
      "Browser storage is a budget, not a bucket. Something writing without bounds will eventually break everything else that needs to save.",
    arm: () => {
      const { wrote, threw } = fillStorage();
      reportIncident({
        kind: "quota-exceeded",
        source: "storage",
        title: threw ? "Browser storage is full" : "Browser storage is nearly full",
        detail: threw
          ? `A write threw QuotaExceededError after ${wrote} blocks of 256KB.`
          : `Wrote ${wrote} blocks without hitting the limit; storage is now heavily loaded.`,
        context: { blocksWritten: wrote, threw },
        fingerprint: "quota-exceeded",
        scenarioId: "quota-exceeded",
      });
    },
    disarm: () => {
      clearStorageBallast();
      resolveKind("quota-exceeded", "Storage was cleared.");
    },
  },
];
