import { actionsFor, allActions, getAction, runRemediation } from "@/incidents/actions";
import { getIncident } from "@/incidents/bus";
import { getTrace } from "@/incidents/networkTrace";
import { runbookFor } from "@/incidents/runbooks";
import type { Incident, RemediationId } from "@/incidents/types";
import { getEngine, interruptGeneration, markGenerating } from "./engineClient";
import { detectIntent } from "./intents";
import { extractJsonObject, parseActions, tidy } from "./parse";
import { buildContext, chartSummary, systemPrompt, TRIAGE_SCHEMA, triagePrompt } from "./prompt";
import { appendMessage, getMessages, getSettings, openDock, patchMessage } from "./store";
import { answerSupportIntent } from "./support";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const KNOWN_ACTIONS = new Set<string>(allActions().map((action) => action.id));
const HISTORY_TURNS = 6;

let generating = false;

export function isGenerating(): boolean {
  return generating;
}

function history(): ChatMessage[] {
  return getMessages()
    .filter((message) => message.role === "user" || message.role === "dispatch")
    .slice(-HISTORY_TURNS)
    .map((message) => ({
      role: message.role === "user" ? ("user" as const) : ("assistant" as const),
      content: message.text,
    }));
}

/* ---------------------------------------------------------------- triage */

/**
 * Fired automatically when an incident opens. The deterministic card has
 * already rendered by now, so this only adds the model's one-line read plus a
 * single recommended action.
 */
export async function triageIncident(incident: Incident): Promise<void> {
  const runbook = runbookFor(incident.kind);
  const fallbackAction = actionsFor(incident)[0]?.id;

  const placeholder = appendMessage({
    role: "dispatch",
    text: runbook.explain,
    actions: fallbackAction ? [fallbackAction] : [],
    incidentId: incident.id,
    deterministic: true,
  });

  let engine: Awaited<ReturnType<typeof getEngine>>;
  try {
    engine = await getEngine();
  } catch {
    return; // Rules-only mode: the runbook text above is the answer.
  }

  try {
    generating = true;
    markGenerating(true);

    const response = await engine.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt(getSettings().persona) },
        { role: "user", content: triagePrompt(incident) },
      ],
      temperature: 0.2,
      max_tokens: 160,
      extra_body: { enable_thinking: false },
      response_format: { type: "json_object", schema: JSON.stringify(TRIAGE_SCHEMA) },
    });

    const content = response.choices[0]?.message?.content ?? "";
    const parsed = extractJsonObject(content);
    const summary = typeof parsed?.summary === "string" ? parsed.summary.trim() : "";
    const nextAction =
      typeof parsed?.nextAction === "string" && KNOWN_ACTIONS.has(parsed.nextAction)
        ? (parsed.nextAction as RemediationId)
        : fallbackAction;

    if (summary.length > 0) {
      patchMessage(placeholder.id, {
        text: `${summary}\n\n${runbook.explain}`,
        actions: nextAction ? [nextAction] : [],
        deterministic: false,
      });
    }
  } catch {
    // Keep the deterministic text; a failed model call must not lose the card.
  } finally {
    generating = false;
    markGenerating(false);
  }
}

/* ------------------------------------------------------------- user turn */

export async function sendUserMessage(input: string): Promise<void> {
  const text = input.trim();
  if (text.length === 0) return;

  appendMessage({ role: "user", text });

  const focusId = [...getMessages()].reverse().find((message) => message.incidentId)?.incidentId;
  const incident = focusId ? getIncident(focusId) : undefined;

  const intent = detectIntent(text);

  if (intent.kind === "action") {
    const message = appendMessage({
      role: "dispatch",
      text: intent.reply,
      incidentId: incident?.id,
      deterministic: true,
    });
    const result = await runRemediation(intent.action, incident);
    patchMessage(message.id, { text: `${intent.reply}\n\n${result.note}` });
    return;
  }

  const support = answerSupportIntent(intent);
  if (support) {
    appendMessage({
      role: "dispatch",
      text: support.text,
      actions: support.actions,
      incidentId: support.actions.length > 0 ? incident?.id : undefined,
      deterministic: true,
    });
    return;
  }

  if (intent.kind === "triage") {
    const runbook = runbookFor(incident?.kind ?? "unknown");
    appendMessage({
      role: "dispatch",
      text: incident
        ? `${runbook.finding}. ${runbook.explain}`
        : "Nothing is failing — no open alarms and the API is answering. Ask me about the board, or arm a scenario from the Chaos Deck and I'll pick it up.",
      actions: incident
        ? actionsFor(incident)
            .slice(0, 2)
            .map((action) => action.id)
        : [],
      incidentId: incident?.id,
      deterministic: true,
    });
    return;
  }

  await streamAnswer(text, incident);
}

async function streamAnswer(text: string, incident?: Incident): Promise<void> {
  const placeholder = appendMessage({
    role: "dispatch",
    text: "",
    incidentId: incident?.id,
    streaming: true,
  });

  let engine: Awaited<ReturnType<typeof getEngine>>;
  try {
    engine = await getEngine();
  } catch (error) {
    const runbook = runbookFor(incident?.kind ?? "unknown");
    patchMessage(placeholder.id, {
      streaming: false,
      deterministic: true,
      text:
        `${error instanceof Error ? error.message : "The local model is unavailable."}\n\n` +
        `Running on runbooks instead. ${runbook.explain}`,
      actions: incident
        ? actionsFor(incident)
            .slice(0, 2)
            .map((action) => action.id)
        : [],
    });
    return;
  }

  const summary = chartSummary();
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(getSettings().persona) },
    ...history().slice(0, -1),
    {
      role: "user",
      content: `${buildContext(incident, text)}${summary ? `\n\n${summary}` : ""}\n\nQUESTION\n${text}`,
    },
  ];

  const answer = await runWithLookups(engine, messages, placeholder.id);
  const { text: clean, actions } = parseActions(answer, KNOWN_ACTIONS);

  patchMessage(placeholder.id, {
    streaming: false,
    text: clean.length > 0 ? clean : "I could not produce an answer for that.",
    actions,
  });

  if (getSettings().autonomy && actions.length > 0) {
    const first = getAction(actions[0]);
    if (first?.risk === "safe") await executeAction(actions[0], incident?.id);
  }
}

/** One bounded round of "let me look at the request log first". */
async function runWithLookups(
  engine: Awaited<ReturnType<typeof getEngine>>,
  messages: ChatMessage[],
  placeholderId: string,
): Promise<string> {
  let answer = await streamInto(engine, messages, placeholderId);

  if (answer.includes("[[look:network]]")) {
    const trace = getTrace(10).map((entry) => ({
      method: entry.method,
      url: entry.url,
      status: entry.status,
      outcome: entry.outcome,
      ms: Math.round(entry.durationMs),
    }));

    messages.push({ role: "assistant", content: "[[look:network]]" });
    messages.push({
      role: "user",
      content: `REQUEST LOG (most recent first)\n${JSON.stringify(trace)}\n\nNow answer the question using this log.`,
    });

    patchMessage(placeholderId, { text: "" });
    answer = await streamInto(engine, messages, placeholderId);
  }

  return answer;
}

async function streamInto(
  engine: Awaited<ReturnType<typeof getEngine>>,
  messages: ChatMessage[],
  placeholderId: string,
): Promise<string> {
  generating = true;
  markGenerating(true);

  try {
    const stream = await engine.chat.completions.create({
      messages,
      temperature: 0.4,
      max_tokens: 420,
      stream: true,
      extra_body: { enable_thinking: false },
    });

    let buffer = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (!delta) continue;
      buffer += delta;
      patchMessage(placeholderId, { text: tidy(buffer.replace(/\[\[action:[a-zA-Z]+\]\]/g, "")) });
    }
    return buffer;
  } catch (error) {
    return error instanceof Error ? error.message : "Generation failed.";
  } finally {
    generating = false;
    markGenerating(false);
  }
}

/* ------------------------------------------------------------ act on it */

export async function executeAction(id: RemediationId, incidentId?: string): Promise<void> {
  const action = getAction(id);
  if (!action) return;

  const incident = incidentId ? getIncident(incidentId) : undefined;
  const message = appendMessage({
    role: "note",
    text: `${action.label}…`,
    incidentId,
    deterministic: true,
  });

  const result = await runRemediation(id, incident);
  patchMessage(message.id, { text: `${action.label}: ${result.note}` });
}

export async function stopGenerating(): Promise<void> {
  await interruptGeneration();
  generating = false;
  markGenerating(false);
}

/** Open the dock focused on an incident and start its triage turn. */
export function engage(incident: Incident): void {
  openDock(incident.id);
  void triageIncident(incident);
}
