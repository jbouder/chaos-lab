import { reportIncident, resolveKind } from "@/incidents/bus";
import type { ScenarioDefinition } from "../registry";
import { blockMainThread, startLeaking, stopLeaking } from "../runtimeState";

export const performanceScenarios: ScenarioDefinition[] = [
  {
    id: "main-thread-freeze",
    title: "Main thread freeze",
    category: "performance",
    kind: "main-thread-freeze",
    severity: "warning",
    oneShot: true,
    symptom: "One synchronous task blocks everything: clicks, typing, animation.",
    lesson:
      "The browser has one thread for your UI. Anything expensive belongs in a worker, or the whole interface holds its breath.",
    knobs: [
      {
        id: "duration",
        label: "Block for",
        min: 400,
        max: 6000,
        step: 200,
        defaultValue: 2200,
        unit: "ms",
      },
    ],
    arm: ({ knob }) => {
      const actual = blockMainThread(knob("duration"));
      reportIncident({
        kind: "main-thread-freeze",
        source: "perf",
        title: "The interface stopped responding",
        detail: `A synchronous task held the main thread for ${(actual / 1000).toFixed(1)}s.`,
        context: { durationMs: Math.round(actual) },
        fingerprint: "long-task",
        scenarioId: "main-thread-freeze",
      });
    },
  },
  {
    id: "memory-leak",
    title: "Memory leak",
    category: "performance",
    kind: "memory-leak",
    severity: "warning",
    symptom: "A timer allocates on an interval and never lets go.",
    lesson:
      "Leaks are rarely dramatic. They are an interval nobody cleared, quietly making the tab worse for an hour.",
    arm: () => startLeaking(),
    disarm: () => {
      const { freedMb } = stopLeaking();
      resolveKind("memory-leak", `Stopped the leaking timers and released about ${freedMb}MB.`);
    },
  },
];
