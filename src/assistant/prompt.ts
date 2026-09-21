import { armedScenarios, getScenario } from "@/chaos/registry";
import { actionsFor } from "@/incidents/actions";
import { getIncidents, getOpenIncidents } from "@/incidents/bus";
import { getTrace } from "@/incidents/networkTrace";
import { runbookFor } from "@/incidents/runbooks";
import type { Incident } from "@/incidents/types";
import { readVitals } from "@/incidents/vitals";
import { apiBreaker } from "@/lib/circuitBreaker";
import { appStore } from "@/store/store";
import { outboxAtom } from "@/victim/api/outbox";
import { feedStateAtom } from "@/victim/feed/feedClient";

export type Persona = "medic" | "plain";

const SHARED_RULES = `Rules you must follow:
- Answer in at most four short sentences. No headings, no bullet lists unless asked for steps.
- Use only the facts in CONTEXT. If the context does not say it, do not claim it.
- Never invent a status code, a field name or a number.
- To offer a fix, end a sentence with its tag, exactly: [[action:actionId]]. Offer at most two, only from AVAILABLE ACTIONS.
- Never write an action tag for something the user did not ask about and the context does not support.
- Do not apologise repeatedly. State what happened, then what to do.
- If you need the recent request log before you can answer, reply with exactly [[look:network]] and nothing else. You may do this once.`;

const MEDIC_PERSONA = `You are the Medic, the on-call assistant inside Chaos Lab — a playground where a freight operations console is deliberately broken so people can watch failures and recoveries up close.

You read the app the way a monitor reads a patient: vitals, alarms, a chart of what has already been tried. You may use that register lightly (a vital is "reading high", the app is "stable"), but you are an engineer first and you never let the metaphor replace a fact.`;

const PLAIN_PERSONA = `You are a calm support assistant inside Chaos Lab, a playground where a freight operations console is deliberately broken so people can see how failures behave.

Explain things the way you would to a colleague who is not an engineer. No jargon, no metaphors, no status codes unless you explain what they mean in the same sentence.`;

export function systemPrompt(persona: Persona): string {
  return `${persona === "medic" ? MEDIC_PERSONA : PLAIN_PERSONA}\n\n${SHARED_RULES}`;
}

function describeIncident(incident: Incident): string {
  const runbook = runbookFor(incident.kind);
  const attempts = incident.attempts
    .map((attempt) => `${attempt.actionId}→${attempt.outcome}`)
    .join(", ");

  const contextEntries = Object.entries(incident.context)
    .filter(([, value]) => value !== undefined && value !== null && typeof value !== "object")
    .slice(0, 6)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");

  return [
    `- [${incident.severity}] ${incident.title}`,
    `  what: ${incident.detail}`,
    contextEntries ? `  data: ${contextEntries}` : null,
    incident.count > 1 ? `  repeated: ${incident.count}x` : null,
    `  known: ${runbook.llmNotes}`,
    attempts ? `  already tried: ${attempts}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Compact, factual, and small enough that a 0.6B model can still hold it. */
export function buildContext(focus?: Incident): string {
  const open = getOpenIncidents().slice(0, 3);
  const incidents = focus
    ? [focus, ...open.filter((item) => item.id !== focus.id)].slice(0, 3)
    : open;

  const vitals = readVitals()
    .map((vital) => `${vital.label} ${vital.display}${vital.unit} (${vital.tone})`)
    .join(", ");

  const armed = armedScenarios()
    .map((entry) => getScenario(entry.id)?.title ?? entry.id)
    .join(", ");

  const actions = actionsFor(focus ?? incidents[0])
    .map((action) => `${action.id}: ${action.description}`)
    .join("\n");

  const recentFailures = getTrace(8)
    .filter((entry) => entry.outcome !== "ok")
    .slice(0, 4)
    .map((entry) => `${entry.method} ${entry.url} → ${entry.status ?? entry.outcome}`)
    .join("; ");

  const lines = [
    "CONTEXT",
    `vitals: ${vitals}`,
    `breaker: ${apiBreaker.snapshot().state}`,
    `online: ${navigator.onLine}`,
    `live feed: ${appStore.get(feedStateAtom)}`,
    `queued writes: ${appStore.get(outboxAtom).length}`,
    armed ? `armed faults: ${armed}` : "armed faults: none",
    recentFailures ? `recent failed requests: ${recentFailures}` : null,
    "",
    incidents.length > 0 ? "OPEN INCIDENTS" : "OPEN INCIDENTS: none",
    ...incidents.map(describeIncident),
    "",
    "AVAILABLE ACTIONS",
    actions,
  ];

  return lines.filter((line) => line !== null).join("\n");
}

/** A one-line summary of what has already been resolved, for continuity. */
export function chartSummary(): string {
  const resolved = getIncidents()
    .filter((incident) => incident.status === "resolved")
    .slice(0, 4);
  if (resolved.length === 0) return "";
  const notes = resolved.map((incident) => `${incident.title} (resolved)`).join("; ");
  return `Earlier in this session: ${notes}.`;
}

export const TRIAGE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    nextAction: { type: "string" },
  },
  required: ["summary"],
  additionalProperties: false,
};

export function triagePrompt(incident: Incident): string {
  const runbook = runbookFor(incident.kind);
  const actions = actionsFor(incident).map((action) => action.id);

  return `${buildContext(incident)}

The incident to triage is the first one listed.
Reply with JSON only: {"summary": "<one sentence, max 22 words, what happened and why>", "nextAction": "<one id from: ${actions.join(", ")}>"}.
Ground the summary in this note: ${runbook.llmNotes}`;
}
