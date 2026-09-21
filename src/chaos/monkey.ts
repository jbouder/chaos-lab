import { atom } from "jotai";
import { appStore } from "@/store/store";
import { allScenarios, armedScenarios, armScenario, disarmScenario } from "./registry";

export type MonkeyConfig = {
  running: boolean;
  /** Seconds between moves. */
  cadence: number;
  /** How many faults may be armed at once. */
  blastRadius: number;
};

export const monkeyAtom = atom<MonkeyConfig>({ running: false, cadence: 20, blastRadius: 2 });
export const monkeyNextAtom = atom<number | null>(null);

let timer: ReturnType<typeof setTimeout> | null = null;

function config(): MonkeyConfig {
  return appStore.get(monkeyAtom);
}

/**
 * Arms and disarms scenarios on its own so failures arrive unannounced — the
 * closest this playground gets to the real thing.
 */
async function move(): Promise<void> {
  const { blastRadius } = config();
  const armed = armedScenarios();

  if (armed.length >= blastRadius) {
    const victim = armed[Math.floor(Math.random() * armed.length)];
    await disarmScenario(victim.id);
  } else {
    const candidates = allScenarios().filter(
      (scenario) => !armed.some((entry) => entry.id === scenario.id),
    );
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    if (pick) await armScenario(pick.id);
  }
}

function schedule(): void {
  const { running, cadence } = config();
  if (!running) return;
  const delay = cadence * 1000;
  appStore.set(monkeyNextAtom, Date.now() + delay);
  timer = setTimeout(async () => {
    await move();
    schedule();
  }, delay);
}

export function startMonkey(): void {
  if (timer) clearTimeout(timer);
  appStore.set(monkeyAtom, { ...config(), running: true });
  schedule();
}

export function stopMonkey(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  appStore.set(monkeyNextAtom, null);
  appStore.set(monkeyAtom, { ...config(), running: false });
}

export function configureMonkey(patch: Partial<MonkeyConfig>): void {
  const next = { ...config(), ...patch };
  appStore.set(monkeyAtom, next);
  if (next.running) {
    if (timer) clearTimeout(timer);
    schedule();
  }
}
