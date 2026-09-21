import { useAtomValue } from "jotai";
import { Bell, X } from "lucide-react";
import { openDock } from "@/assistant/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { acknowledgeIncident, incidentsAtom } from "../bus";
import { ALARM_LABEL, SEVERITY_RANK } from "../types";

/**
 * The monitor's alarm line. One bar, the loudest unacknowledged alarm, with
 * acknowledging kept separate from fixing — exactly as a real alarm works.
 */
export function AlarmBar() {
  const incidents = useAtomValue(incidentsAtom);

  const alarm = incidents
    .filter(
      (incident) =>
        !incident.acknowledged &&
        incident.status !== "resolved" &&
        SEVERITY_RANK[incident.severity] >= SEVERITY_RANK.warning,
    )
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0];

  if (!alarm) return null;

  const critical = alarm.severity === "critical";

  return (
    <div
      role="status"
      aria-live="assertive"
      className={cn(
        "flex items-center gap-3 border-b px-4 py-2",
        critical
          ? "border-crisis/40 bg-crisis/10 text-crisis"
          : "border-caution/40 bg-caution/10 text-caution",
      )}
    >
      <Bell
        className={cn("size-3.5 shrink-0", critical && "motion-safe:animate-pulse")}
        aria-hidden
      />
      <p className="min-w-0 flex-1 truncate text-xs">
        <span className="uppercase tracking-[0.12em]">{ALARM_LABEL[alarm.severity]}</span>
        <span className="mx-2 opacity-40">|</span>
        <span className="text-foreground">{alarm.title}</span>
        {alarm.count > 1 && (
          <span className="tabular ml-2 font-mono opacity-70">×{alarm.count}</span>
        )}
      </p>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 shrink-0 px-2 text-xs text-foreground"
        onClick={() => openDock(alarm.id)}
      >
        Ask the Medic
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-7 shrink-0"
        aria-label="Acknowledge this alarm"
        onClick={() => acknowledgeIncident(alarm.id)}
      >
        <X className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}
