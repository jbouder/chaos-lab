import { useAtomValue } from "jotai";
import { CircleCheck, CircleDot, Headset, Trash2 } from "lucide-react";
import { openDock } from "@/assistant/store";
import { Button } from "@/components/ui/button";
import { clockTime, sinceLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getAction } from "../actions";
import { clearIncidents, incidentsAtom } from "../bus";
import { runbookFor } from "../runbooks";
import { ALARM_LABEL, type Incident } from "../types";

const DOT: Record<string, string> = {
  info: "text-muted-foreground",
  warning: "text-caution",
  error: "text-caution",
  critical: "text-crisis",
};

/** The chart: findings, interventions and outcomes, in the order they happened. */
export function IncidentTimeline() {
  const incidents = useAtomValue(incidentsAtom);

  if (incidents.length === 0) {
    return (
      <div className="border border-dashed border-border p-8 text-center">
        <p className="text-sm text-foreground">The chart is empty.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Arm a scenario from the Chaos Deck and every finding, intervention and outcome lands here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          {incidents.length} {incidents.length === 1 ? "entry" : "entries"}
        </p>
        <Button size="sm" variant="ghost" onClick={clearIncidents}>
          <Trash2 className="size-3.5" aria-hidden />
          Clear the chart
        </Button>
      </div>

      <ol className="border-l border-border">
        {incidents.map((incident) => (
          <ChartNote key={incident.id} incident={incident} />
        ))}
      </ol>
    </div>
  );
}

function ChartNote({ incident }: { incident: Incident }) {
  const runbook = runbookFor(incident.kind);
  const resolved = incident.status === "resolved";

  return (
    <li className="relative py-4 pl-6 pr-1">
      <span className="absolute -left-[7px] top-[1.35rem]">
        {resolved ? (
          <CircleCheck className="size-3.5 bg-background text-healthy" aria-hidden />
        ) : (
          <CircleDot className={cn("size-3.5 bg-background", DOT[incident.severity])} aria-hidden />
        )}
      </span>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tabular font-mono text-xs text-muted-foreground">
          {clockTime(incident.at)}
        </span>
        <span
          className={cn(
            "text-[11px] uppercase tracking-[0.12em]",
            resolved ? "text-healthy" : DOT[incident.severity],
          )}
        >
          {resolved ? "Resolved" : ALARM_LABEL[incident.severity]}
        </span>
        <span className="text-sm font-medium tracking-tight text-foreground">{incident.title}</span>
        {incident.count > 1 && (
          <span className="tabular font-mono text-xs text-muted-foreground">×{incident.count}</span>
        )}
      </div>

      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{incident.detail}</p>

      {incident.attempts.length > 0 && (
        <ul className="mt-2 space-y-1">
          {incident.attempts.map((attempt) => (
            <li
              key={`${attempt.actionId}-${attempt.at}`}
              className="flex flex-wrap items-baseline gap-2 text-xs"
            >
              <span className="tabular font-mono text-muted-foreground">
                {clockTime(attempt.at)}
              </span>
              <span className={attempt.outcome === "ok" ? "text-healthy" : "text-caution"}>
                {getAction(attempt.actionId)?.label ?? attempt.actionId}
              </span>
              <span className="text-muted-foreground">{attempt.note}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground">{runbook.finding}</span>
        <span className="text-xs text-muted-foreground opacity-50">·</span>
        <span className="text-xs text-muted-foreground">{sinceLabel(incident.updatedAt)}</span>
        {!resolved && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => openDock(incident.id)}
          >
            <Headset className="size-3" aria-hidden />
            Ask Dispatch
          </Button>
        )}
      </div>
    </li>
  );
}
