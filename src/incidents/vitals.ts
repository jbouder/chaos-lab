import { apiBreaker } from "@/lib/circuitBreaker";
import { appStore } from "@/store/store";
import { feedEventsAtom, feedStateAtom, lastEventAtAtom } from "@/victim/feed/feedClient";
import { currentHeapMb } from "./detectors";
import { traceStats } from "./networkTrace";

export type VitalId = "hr" | "spo2" | "bp" | "resp" | "temp";
export type VitalTone = "healthy" | "caution" | "crisis" | "idle";

export type VitalReading = {
  id: VitalId;
  /** Clinical shorthand, kept because it is what makes the strip scannable. */
  label: string;
  /** What the shorthand actually measures in this app. */
  meaning: string;
  value: number;
  display: string;
  unit: string;
  tone: VitalTone;
  /** 0..1, used to scale the trace. */
  normalised: number;
};

function tone(value: number, caution: number, crisis: number, invert = false): VitalTone {
  const breach = invert
    ? (x: number, limit: number) => x < limit
    : (x: number, limit: number) => x > limit;
  if (breach(value, crisis)) return "crisis";
  if (breach(value, caution)) return "caution";
  return "healthy";
}

export function readVitals(): VitalReading[] {
  const stats = traceStats();
  const feedState = appStore.get(feedStateAtom);
  const lastEventAt = appStore.get(lastEventAtAtom);
  const events = appStore.get(feedEventsAtom);
  const heapMb = currentHeapMb();
  const breaker = apiBreaker.snapshot();

  const recentEvents = events.filter((event) => Date.now() - event.at < 60_000).length;
  const feedSilentMs = lastEventAt ? Date.now() - lastEventAt : Number.POSITIVE_INFINITY;

  const hr: VitalReading = {
    id: "hr",
    label: "HR",
    meaning: "API requests per minute",
    value: stats.requestsPerMinute,
    display: stats.sampleSize === 0 ? "--" : String(stats.requestsPerMinute),
    unit: "rpm",
    tone: stats.sampleSize === 0 ? "idle" : tone(stats.requestsPerMinute, 90, 160),
    normalised: Math.min(1, stats.requestsPerMinute / 180),
  };

  const spo2: VitalReading = {
    id: "spo2",
    label: "SpO₂",
    meaning: "Share of requests succeeding",
    value: stats.successRate,
    display: stats.sampleSize === 0 ? "--" : `${Math.round(stats.successRate * 100)}`,
    unit: "%",
    tone:
      stats.sampleSize === 0
        ? "idle"
        : breaker.state === "open"
          ? "crisis"
          : tone(stats.successRate, 0.97, 0.75, true),
    normalised: stats.successRate,
  };

  const bp: VitalReading = {
    id: "bp",
    label: "BP",
    meaning: "Response latency, median over 95th percentile",
    value: stats.p95,
    display: stats.sampleSize === 0 ? "--/--" : `${Math.round(stats.p50)}/${Math.round(stats.p95)}`,
    unit: "ms",
    tone: stats.sampleSize === 0 ? "idle" : tone(stats.p95, 1200, 4000),
    normalised: Math.min(1, stats.p95 / 6000),
  };

  const resp: VitalReading = {
    id: "resp",
    label: "RESP",
    meaning: "Live feed events per minute",
    value: recentEvents,
    display:
      feedState === "reconnecting" || feedState === "closed"
        ? "00"
        : String(recentEvents).padStart(2, "0"),
    unit: "/min",
    tone:
      feedState === "reconnecting" || feedState === "closed"
        ? "crisis"
        : feedState === "polling" || feedSilentMs > 12_000
          ? "caution"
          : feedState === "open"
            ? "healthy"
            : "idle",
    normalised: Math.min(1, recentEvents / 40),
  };

  const temp: VitalReading = {
    id: "temp",
    label: "TEMP",
    meaning: "JavaScript heap in use",
    value: heapMb ?? 0,
    display: heapMb == null ? "--" : heapMb.toFixed(0),
    unit: "MB",
    tone: heapMb == null ? "idle" : tone(heapMb, 220, 500),
    normalised: heapMb == null ? 0.2 : Math.min(1, heapMb / 700),
  };

  return [hr, spo2, bp, resp, temp];
}

export function worstTone(readings: VitalReading[]): VitalTone {
  if (readings.some((reading) => reading.tone === "crisis")) return "crisis";
  if (readings.some((reading) => reading.tone === "caution")) return "caution";
  return "healthy";
}
