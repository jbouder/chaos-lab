import { atom } from "jotai";
import { appStore } from "@/store/store";

/** Panels read these to misbehave on demand. */
export const crashPanelAtom = atom(false);
export const loopPanelAtom = atom(false);
export const duplicateSubmitAtom = atom(false);
export const leakingAtom = atom(false);
export const leakedMb = atom(0);

const SETTINGS_KEY = "chaos-lab:settings";

export function setCrashPanel(value: boolean): void {
  appStore.set(crashPanelAtom, value);
}

export function setLoopPanel(value: boolean): void {
  appStore.set(loopPanelAtom, value);
}

export function setDuplicateSubmit(value: boolean): void {
  appStore.set(duplicateSubmitAtom, value);
}

/* ------------------------------------------------------------- the leak */

let leakTimer: ReturnType<typeof setInterval> | null = null;
let ballast: number[][] = [];

export function startLeaking(): void {
  if (leakTimer) return;
  appStore.set(leakingAtom, true);
  leakTimer = setInterval(() => {
    // Timers that outlive their component, each holding a chunk of memory.
    ballast.push(new Array(220_000).fill(Math.random()));
    appStore.set(leakedMb, Math.round((ballast.length * 220_000 * 8) / 1024 / 1024));
  }, 400);
}

export function stopLeaking(): { freedMb: number } {
  if (leakTimer) {
    clearInterval(leakTimer);
    leakTimer = null;
  }
  const freedMb = appStore.get(leakedMb);
  ballast = [];
  appStore.set(leakedMb, 0);
  appStore.set(leakingAtom, false);
  return { freedMb };
}

/* --------------------------------------------------------- local storage */

export function corruptSavedSettings(): void {
  localStorage.setItem(SETTINGS_KEY, '{"density":"comfortable","columns":[ broken');
}

export function readSavedSettings(): Record<string, unknown> | null {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as Record<string, unknown>;
}

export function writeSavedSettings(value: Record<string, unknown>): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
}

export function resetSavedSettings(): void {
  localStorage.removeItem(SETTINGS_KEY);
  writeSavedSettings({ density: "comfortable", columns: ["reference", "lane", "eta", "status"] });
}

const BALLAST_PREFIX = "chaos-lab:ballast:";

export function fillStorage(): { wrote: number; threw: boolean } {
  const blob = "x".repeat(256 * 1024);
  let wrote = 0;
  for (let index = 0; index < 512; index += 1) {
    try {
      localStorage.setItem(`${BALLAST_PREFIX}${index}`, blob);
      wrote += 1;
    } catch {
      return { wrote, threw: true };
    }
  }
  return { wrote, threw: false };
}

export function clearStorageBallast(): number {
  const keys = Object.keys(localStorage).filter((key) => key.startsWith(BALLAST_PREFIX));
  for (const key of keys) localStorage.removeItem(key);
  return keys.length;
}

/* ------------------------------------------------------------- the freeze */

export function blockMainThread(durationMs: number): number {
  const start = performance.now();
  // Deliberately synchronous: this is the whole point of the scenario.
  while (performance.now() - start < durationMs) {
    Math.sqrt(Math.random() * 1e9);
  }
  return performance.now() - start;
}

/* --------------------------------------------------------- connectivity */

let onlineOverridden = false;

export function forceOffline(): void {
  if (onlineOverridden) return;
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
  onlineOverridden = true;
  window.dispatchEvent(new Event("offline"));
}

export function restoreOnline(): void {
  if (!onlineOverridden) return;
  Reflect.deleteProperty(navigator, "onLine");
  onlineOverridden = false;
  window.dispatchEvent(new Event("online"));
}
