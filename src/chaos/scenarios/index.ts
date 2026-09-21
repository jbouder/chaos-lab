import { registerScenarios } from "../registry";
import { authScenarios } from "./auth";
import { networkScenarios } from "./network";
import { performanceScenarios } from "./performance";
import { realtimeScenarios } from "./realtime";
import { runtimeScenarios } from "./runtime";

export const scenarios = [
  ...networkScenarios,
  ...authScenarios,
  ...runtimeScenarios,
  ...performanceScenarios,
  ...realtimeScenarios,
];

let registered = false;

export function installScenarios(): void {
  if (registered) return;
  registerScenarios(scenarios);
  registered = true;
}

export const CATEGORY_LABEL: Record<string, string> = {
  network: "Network",
  auth: "Auth & session",
  runtime: "Runtime",
  performance: "Performance",
  realtime: "Realtime",
};
