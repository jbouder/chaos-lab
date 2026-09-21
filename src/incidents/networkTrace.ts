import { atom } from "jotai";
import { appStore } from "@/store/store";

export type TraceEntry = {
  id: string;
  method: string;
  url: string;
  startedAt: number;
  durationMs: number;
  status: number | null;
  outcome: "ok" | "error" | "aborted" | "network";
  note?: string;
};

const MAX_ENTRIES = 120;

export const traceAtom = atom<TraceEntry[]>([]);

export function recordTrace(entry: TraceEntry): void {
  const next = [entry, ...appStore.get(traceAtom)].slice(0, MAX_ENTRIES);
  appStore.set(traceAtom, next);
}

export function getTrace(limit = MAX_ENTRIES): TraceEntry[] {
  return appStore.get(traceAtom).slice(0, limit);
}

export function clearTrace(): void {
  appStore.set(traceAtom, []);
}

export type TraceStats = {
  requestsPerMinute: number;
  successRate: number;
  p50: number;
  p95: number;
  inFlight: number;
  sampleSize: number;
};

export function traceStats(windowMs = 60_000): TraceStats {
  const now = Date.now();
  const recent = appStore
    .get(traceAtom)
    .filter((entry) => now - entry.startedAt <= windowMs)
    // A cancelled request is neither a success nor a failure of the server.
    .filter((entry) => entry.outcome !== "aborted");
  if (recent.length === 0) {
    return { requestsPerMinute: 0, successRate: 1, p50: 0, p95: 0, inFlight: 0, sampleSize: 0 };
  }

  const durations = recent.map((entry) => entry.durationMs).sort((a, b) => a - b);
  const at = (q: number) =>
    durations[Math.min(durations.length - 1, Math.floor(durations.length * q))];
  const successes = recent.filter((entry) => entry.outcome === "ok").length;

  return {
    requestsPerMinute: Math.round((recent.length / windowMs) * 60_000),
    successRate: successes / recent.length,
    p50: at(0.5),
    p95: at(0.95),
    inFlight: 0,
    sampleSize: recent.length,
  };
}
