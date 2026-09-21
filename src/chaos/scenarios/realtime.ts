import { feedClient } from "@/victim/feed/feedClient";
import type { ScenarioDefinition } from "../registry";

export const realtimeScenarios: ScenarioDefinition[] = [
  {
    id: "feed-drop",
    title: "Live feed drops",
    category: "realtime",
    kind: "feed-disconnected",
    severity: "error",
    symptom: "The realtime connection closes and reconnect attempts keep failing.",
    lesson:
      "A frozen feed is not a wrong feed. Show when the last event arrived, back off between attempts, and keep polling in your back pocket.",
    arm: () => feedClient.sever(),
    disarm: () => feedClient.restore(),
  },
];
