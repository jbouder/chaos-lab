import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { crashPanelAtom, loopPanelAtom } from "@/chaos/runtimeState";
import { reportIncident } from "@/incidents/bus";

/** Seven days of forecast volume for the busiest lane. Static on purpose. */
const FORECAST = [62, 58, 71, 69, 84, 91, 78, 74, 88, 96, 90, 83];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function sparklinePoints(series: number[], width: number, height: number): string {
  const max = Math.max(...series);
  const min = Math.min(...series);
  const span = max - min || 1;
  const step = series.length > 1 ? width / (series.length - 1) : width;
  return series
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function CrashPanel() {
  const crashing = useAtomValue(crashPanelAtom);

  if (crashing) {
    throw new Error(
      "Lane forecast widget failed to render: cannot read property 'series' of undefined",
    );
  }

  const latest = FORECAST[FORECAST.length - 1];
  const previous = FORECAST[FORECAST.length - 2];
  const change = latest - previous;

  return (
    <section aria-label="Lane forecast" className="rounded-md border border-border">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          Lane forecast
        </h2>
        <span className="font-mono text-xs tabular text-muted-foreground">12w</span>
      </header>
      <div className="px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          Rotterdam → Hamburg
        </p>
        <p className="mt-1.5 font-mono text-2xl tabular tracking-tight">{latest}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          bookings next week, {change >= 0 ? "+" : ""}
          {change} against this week
        </p>
        <svg
          viewBox="0 0 240 56"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Forecast trend, latest ${latest} bookings`}
          className="mt-3 h-14 w-full"
        >
          <polyline
            points={sparklinePoints(FORECAST, 240, 56)}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            className="text-healthy"
          />
        </svg>
      </div>
    </section>
  );
}

const RENDER_LIMIT = 40;

export function LoopPanel() {
  const looping = useAtomValue(loopPanelAtom);
  const [ticks, setTicks] = useState(0);
  const renders = useRef(0);
  const reported = useRef(false);

  renders.current += 1;
  const bailedOut = looping && renders.current > RENDER_LIMIT;

  useEffect(() => {
    if (!looping || renders.current > RENDER_LIMIT) return;
    // The bug: an effect whose own state update re-triggers it.
    setTicks(ticks + 1);
  }, [looping, ticks]);

  useEffect(() => {
    if (!bailedOut || reported.current) return;
    reported.current = true;
    reportIncident({
      kind: "render-loop",
      source: "boundary",
      title: "A panel is re-rendering without stopping",
      detail:
        "Capacity utilisation re-rendered 40 times in one mount because an effect kept writing the state it depends on. A render guard stopped it before the tab froze.",
      context: { renders: RENDER_LIMIT },
      fingerprint: "render-loop",
    });
  }, [bailedOut]);

  if (bailedOut) {
    return (
      <section aria-label="Capacity utilisation" className="rounded-md border border-border">
        <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Capacity utilisation
          </h2>
          <span className="font-mono text-xs tabular text-crisis">halted</span>
        </header>
        <div className="space-y-2 px-4 py-3">
          <p className="text-sm text-caution">This panel was re-rendering without stopping.</p>
          <p className="text-sm text-muted-foreground">
            A render guard stopped it after {RENDER_LIMIT} renders in one mount, so the rest of the
            console stayed responsive. Reset the panel to remount it with clean state.
          </p>
          <p className="font-mono text-xs tabular text-muted-foreground">
            renders={renders.current} ticks={ticks}
          </p>
        </div>
      </section>
    );
  }

  const utilisation = [
    { day: DAYS[0], value: 72 },
    { day: DAYS[1], value: 81 },
    { day: DAYS[2], value: 64 },
    { day: DAYS[3], value: 93 },
    { day: DAYS[4], value: 88 },
  ];

  return (
    <section aria-label="Capacity utilisation" className="rounded-md border border-border">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          Capacity utilisation
        </h2>
        <span className="font-mono text-xs tabular text-muted-foreground">5d</span>
      </header>
      <ul className="space-y-2.5 px-4 py-3">
        {utilisation.map((entry) => (
          <li key={entry.day} className="flex items-center gap-3">
            <span className="w-9 font-mono text-[11px] tabular text-muted-foreground">
              {entry.day}
            </span>
            <div
              role="progressbar"
              aria-label={`Utilisation on ${entry.day}`}
              aria-valuenow={entry.value}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full bg-primary" style={{ width: `${entry.value}%` }} />
            </div>
            <span className="w-10 text-right font-mono text-[11px] tabular text-muted-foreground">
              {entry.value}%
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
