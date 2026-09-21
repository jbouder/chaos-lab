import { useEffect } from "react";
import { subscribeIncidents } from "@/incidents/bus";
import { type IncidentKind, SEVERITY_RANK } from "@/incidents/types";
import { triageIncident } from "./orchestrator";
import { appendMessage, getSettings, openDock } from "./store";

const OPEN_QUIET_MS = 6000;
/** A second incident of the same kind is the same story, not a new one. */
const SAME_KIND_QUIET_MS = 90_000;

/**
 * Decides when the Medic speaks up. Errors and crises open the dock once per
 * storm; advisories only badge the button. A repeat of a kind it has already
 * triaged gets one line, not a second identical card.
 */
export function useAutoEngage(): void {
  useEffect(() => {
    let lastOpenedAt = 0;
    const triagedAt = new Map<IncidentKind, number>();

    return subscribeIncidents((event) => {
      if (event.type !== "opened") return;

      const { incident } = event;
      if (SEVERITY_RANK[incident.severity] < SEVERITY_RANK.error) return;

      const now = Date.now();
      const lastForKind = triagedAt.get(incident.kind) ?? 0;
      const repeat = now - lastForKind < SAME_KIND_QUIET_MS;

      if (!getSettings().doNotInterrupt && now - lastOpenedAt > OPEN_QUIET_MS) {
        openDock(incident.id);
        lastOpenedAt = now;
      }

      if (repeat) {
        appendMessage({
          role: "note",
          text: `Still failing: ${incident.title}`,
          incidentId: incident.id,
          deterministic: true,
        });
        return;
      }

      triagedAt.set(incident.kind, now);

      if (getSettings().doNotInterrupt) {
        appendMessage({
          role: "note",
          text: `New alarm: ${incident.title}`,
          incidentId: incident.id,
          deterministic: true,
        });
      }

      void triageIncident(incident);
    });
  }, []);
}
