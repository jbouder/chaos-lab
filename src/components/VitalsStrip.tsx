import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { traceAtom } from "@/incidents/networkTrace";
import { readVitals, type VitalReading, type VitalTone } from "@/incidents/vitals";

const HISTORY = 96;
const TONE_VAR: Record<VitalTone, string> = {
  healthy: "--vital-healthy",
  caution: "--vital-caution",
  crisis: "--vital-crisis",
  idle: "--vital-idle",
};

type Series = Record<string, number[]>;

/**
 * The bedside strip. Each trace is a rolling window of one vital, drawn so the
 * *shape* carries the diagnosis: a flatline for an outage, a ragged line for a
 * flaky upstream, tall slow waves for latency.
 */
export function VitalsStrip() {
  const [readings, setReadings] = useState<VitalReading[]>(() => readVitals());
  const series = useRef<Series>({});
  // Re-reading on every trace change keeps the strip honest about traffic.
  useAtomValue(traceAtom);

  useEffect(() => {
    const sample = () => {
      const next = readVitals();
      for (const reading of next) {
        const history = series.current[reading.id] ?? [];
        history.push(reading.normalised);
        if (history.length > HISTORY) history.shift();
        series.current[reading.id] = history;
      }
      setReadings(next);
    };

    sample();
    const timer = setInterval(sample, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section
      aria-label="Application vitals"
      className="grid grid-cols-3 gap-px border-b border-border bg-border sm:grid-cols-5"
    >
      {readings.map((reading) => (
        <Vital key={reading.id} reading={reading} history={series.current[reading.id] ?? []} />
      ))}
      {/* Fills the odd cell left by five vitals in a three-column grid. */}
      <div className="bg-background sm:hidden" aria-hidden />
    </section>
  );
}

function Vital({ reading, history }: { reading: VitalReading; history: number[] }) {
  const color = `var(${TONE_VAR[reading.tone]})`;

  return (
    <div className="relative flex items-center gap-3 bg-background px-3 py-2 sm:px-4 sm:py-2.5">
      <div className="min-w-0 shrink-0 sm:min-w-[4.5rem]">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {reading.label}
        </p>
        <p className="tabular font-mono text-base leading-tight sm:text-lg" style={{ color }}>
          {reading.display}
          <span className="ml-0.5 text-[10px] text-muted-foreground">{reading.unit}</span>
        </p>
      </div>

      <div className="hidden min-w-0 flex-1 md:block">
        <Trace history={history} color={color} tone={reading.tone} />
      </div>

      <span className="sr-only">
        {reading.meaning}: {reading.display} {reading.unit}, {reading.tone}
      </span>
    </div>
  );
}

function Trace({ history, color, tone }: { history: number[]; color: string; tone: VitalTone }) {
  const width = 160;
  const height = 34;

  if (history.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[34px] w-full"
        preserveAspectRatio="none"
        aria-hidden
      >
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--trace-grid)"
          strokeWidth="1"
        />
      </svg>
    );
  }

  const step = width / (HISTORY - 1);
  const points = history.map((value, index) => {
    const x = index * step;
    const y = height - 2 - value * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-[34px] w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <line
        x1="0"
        y1={height / 2}
        x2={width}
        y2={height / 2}
        stroke="var(--trace-grid)"
        strokeWidth="1"
        strokeDasharray="2 4"
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={tone === "crisis" ? 1.75 : 1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
