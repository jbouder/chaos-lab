import { atom } from "jotai";
import type { IncidentKind, Severity } from "@/incidents/types";
import { appStore } from "@/store/store";
import { provokeTraffic } from "@/victim/api/provoke";

export type ScenarioCategory = "network" | "auth" | "runtime" | "performance" | "realtime";

export type Knob = {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit?: string;
  format?: (value: number) => string;
};

export type ScenarioContext = { knob: (id: string) => number };

export type ScenarioDefinition = {
  id: string;
  title: string;
  category: ScenarioCategory;
  /** One line on the card: what the user will see happen. */
  symptom: string;
  /** The teaching point, shown when the card is expanded. */
  lesson: string;
  kind: IncidentKind;
  severity: Severity;
  knobs?: Knob[];
  /** Fires once and disarms itself (a crash, a freeze). */
  oneShot?: boolean;
  arm: (context: ScenarioContext) => void | Promise<void>;
  disarm?: (context: ScenarioContext) => void | Promise<void>;
};

export type ArmedScenario = { id: string; armedAt: number; knobs: Record<string, number> };

export const armedAtom = atom<ArmedScenario[]>([]);

const registry = new Map<string, ScenarioDefinition>();

export function registerScenarios(definitions: ScenarioDefinition[]): void {
  for (const definition of definitions) registry.set(definition.id, definition);
}

export function allScenarios(): ScenarioDefinition[] {
  return [...registry.values()];
}

export function getScenario(id: string): ScenarioDefinition | undefined {
  return registry.get(id);
}

export function armedScenarios(): ArmedScenario[] {
  return appStore.get(armedAtom);
}

export function isArmed(id: string): boolean {
  return armedScenarios().some((scenario) => scenario.id === id);
}

function contextFor(
  definition: ScenarioDefinition,
  knobs: Record<string, number>,
): ScenarioContext {
  return {
    knob: (id: string) =>
      knobs[id] ?? definition.knobs?.find((knob) => knob.id === id)?.defaultValue ?? 0,
  };
}

export function defaultKnobs(definition: ScenarioDefinition): Record<string, number> {
  const values: Record<string, number> = {};
  for (const knob of definition.knobs ?? []) values[knob.id] = knob.defaultValue;
  return values;
}

export async function armScenario(
  id: string,
  knobs?: Record<string, number>,
): Promise<ScenarioDefinition | undefined> {
  const definition = registry.get(id);
  if (!definition) return undefined;

  const resolved = { ...defaultKnobs(definition), ...knobs };
  await definition.arm(contextFor(definition, resolved));

  if (!definition.oneShot) {
    const existing = armedScenarios().filter((scenario) => scenario.id !== id);
    appStore.set(armedAtom, [...existing, { id, armedAt: Date.now(), knobs: resolved }]);
  }

  // An armed fault only changes what the API would do. Push traffic through it
  // now so the symptom shows up while the user is still looking at the switch.
  void provokeTraffic();

  return definition;
}

export async function disarmScenario(id: string): Promise<void> {
  const definition = registry.get(id);
  const armed = armedScenarios().find((scenario) => scenario.id === id);
  if (definition?.disarm) {
    await definition.disarm(contextFor(definition, armed?.knobs ?? defaultKnobs(definition)));
  }
  appStore.set(
    armedAtom,
    armedScenarios().filter((scenario) => scenario.id !== id),
  );
  // Same on the way out: prove the recovery instead of waiting for a poll.
  void provokeTraffic();
}

export async function disarmAllScenarios(): Promise<number> {
  const armed = armedScenarios();
  for (const scenario of armed) await disarmScenario(scenario.id);
  return armed.length;
}

export async function updateKnobs(id: string, knobs: Record<string, number>): Promise<void> {
  if (!isArmed(id)) return;
  await disarmScenario(id);
  await armScenario(id, knobs);
}
