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
import { commandCatalogue } from "./commands";
import { knowledgeContext } from "./knowledge";
import { opsContext } from "./opsData";

export type Persona = "dispatch" | "plain";

const SHARED_RULES = `Rules you must follow:
- Answer in at most four short sentences. No headings, no bullet lists unless asked for steps.
- Use only the facts in CONTEXT. If the context does not say it, do not claim it.
- Never invent a status code, a field name or a number.
- To offer a fix, end a sentence with its tag, exactly: [[action:actionId]]. Offer at most two, only from AVAILABLE ACTIONS.
- To offer to drive the app — open a page, change the theme, show the Chaos Deck — end a sentence with [[do:commandId]], only from APP COMMANDS. At most one per answer, and only when the user would plainly want it.
- Never write an action tag for something the user did not ask about and the context does not support.
- Do not apologise repeatedly. State what happened, then what to do.
- If you need the recent request log before you can answer, reply with exactly [[look:network]] and nothing else. You may do this once.`;

const DISPATCH_PERSONA = `You are Dispatch, the assistant inside Meridian Operations — a freight console where controllers track shipments, lanes and carriers. Meridian runs inside Chaos Lab, a playground that breaks the console on purpose so people can watch failures and recoveries up close.

You have two jobs and you switch between them without being asked.

Routine: answer questions about the board. Where a shipment is, what a status or priority means, which lanes are busy, how to book a load. This is most of what you do.

Escalation: when something breaks, you read the alarms, the vitals and the request log, say plainly what failed, and offer the fix. The instrumentation borrows a patient monitor's vocabulary — vitals, alarms, triage — and you may use that register lightly, but you are an engineer first and never let the metaphor replace a fact.

When the operations data below says UNAVAILABLE, say so instead of guessing. You can only see what the app itself can see; that is the honest answer and usually the useful one.`;

const PLAIN_PERSONA = `You are Dispatch, the assistant inside Meridian Operations, a freight console where controllers track shipments, lanes and carriers. You answer questions about the board day to day, and explain what went wrong when something breaks.

Explain things the way you would to a colleague who is not an engineer. No jargon, no metaphors, no status codes unless you explain what they mean in the same sentence. When the data below says UNAVAILABLE, say so plainly rather than guessing.`;

export function systemPrompt(persona: Persona): string {
  return `${persona === "dispatch" ? DISPATCH_PERSONA : PLAIN_PERSONA}\n\n${SHARED_RULES}`;
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
export function buildContext(focus?: Incident, question?: string): string {
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

  const knowledge = question ? knowledgeContext(question) : "";

  const lines = [
    opsContext(),
    "",
    knowledge ? `${knowledge}\n` : null,
    "APP HEALTH",
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
    "",
    "APP COMMANDS",
    commandCatalogue(),
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
