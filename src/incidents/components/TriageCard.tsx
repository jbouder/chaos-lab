import { useAtomValue } from "jotai";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { clockTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { actionsFor, panelResetAtom, runRemediation } from "../actions";
import { runbookFor } from "../runbooks";
import { ALARM_LABEL, type Incident, type RemediationId } from "../types";

const TONE: Record<string, string> = {
  info: "text-muted-foreground",
  warning: "text-caution",
  error: "text-caution",
  critical: "text-crisis",
};

/**
 * Rendered the instant an incident opens, straight from the runbook — no model
 * involved. The Dispatch's reading arrives afterwards and adds to this.
 */
export function TriageCard({
  incident,
  compact = false,
}: {
  incident: Incident;
  compact?: boolean;
}) {
  const runbook = runbookFor(incident.kind);
  const actions = actionsFor(incident);
  const [busy, setBusy] = useState<RemediationId | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  useAtomValue(panelResetAtom);

  const run = async (id: RemediationId) => {
    setBusy(id);
    setOutcome(null);
    const result = await runRemediation(id, incident);
    setOutcome(result.note);
    setBusy(null);
  };

  return (
    <div className={cn("space-y-3 border border-border bg-card p-4", compact && "p-3")}>
      <div className="flex items-baseline justify-between gap-3">
        <p
          className={cn(
            "text-[11px] uppercase tracking-[0.12em]",
            TONE[incident.severity] ?? "text-muted-foreground",
          )}
        >
          {ALARM_LABEL[incident.severity]} · {runbook.finding}
        </p>
        <span className="tabular shrink-0 font-mono text-[11px] text-muted-foreground">
          {clockTime(incident.at)}
        </span>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium tracking-tight text-foreground">{incident.title}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{runbook.explain}</p>
      </div>

      {!compact && (
        <ol className="space-y-1 border-l border-border pl-3">
          {runbook.userSteps.map((step) => (
            <li key={step} className="text-xs leading-relaxed text-muted-foreground">
              {step}
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap gap-2">
        {actions.map((action, index) => (
          <Button
            key={action.id}
            size="sm"
            variant={index === 0 ? "default" : "outline"}
            disabled={busy !== null}
            onClick={() => run(action.id)}
          >
            {busy === action.id ? "Working…" : action.label}
          </Button>
        ))}
      </div>

      {outcome && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {outcome}
        </p>
      )}
    </div>
  );
}
