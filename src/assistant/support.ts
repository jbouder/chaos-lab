import { actionsFor } from "@/incidents/actions";
import { runbookFor } from "@/incidents/runbooks";
import type { Incident, RemediationId } from "@/incidents/types";
import type { Shipment } from "@/victim/api/schemas";
import type { Intent } from "./intents";
import {
  allShipments,
  describeShipment,
  findShipment,
  readMetrics,
  readShipments,
  shipmentsByStatus,
} from "./opsData";

export type SupportReply = { text: string; actions: RemediationId[] };

const STATUS_LABEL: Record<Shipment["status"], string> = {
  scheduled: "scheduled",
  "in-transit": "in transit",
  delayed: "delayed",
  exception: "flagged as an exception",
  delivered: "delivered",
};

/**
 * What Dispatch says when the board itself is unreachable. Saying "I cannot
 * see it either" is the truthful answer — the assistant reads the same cache
 * the screens read, so a fault blinds it exactly where it blinds the UI.
 */
/** Error messages arrive without punctuation; the sentence needs it. */
function stop(reason: string): string {
  return /[.!?]$/.test(reason.trim()) ? reason.trim() : `${reason.trim()}.`;
}

function blindReply(): SupportReply | null {
  const readout = readShipments();

  if (readout.state === "failed") {
    return {
      text: `I can't reach the shipment service right now — ${stop(readout.reason)} I'm reading the same API the board is, so I'm as blind as the screen is until it answers.`,
      actions: ["retryWithBackoff"],
    };
  }

  if (readout.state === "missing") {
    return {
      text: "The board hasn't loaded in this tab yet. Open Shipments and I'll have the records.",
      actions: ["retry"],
    };
  }

  return null;
}

function shipmentReply(reference: string): SupportReply {
  const shipment = findShipment(reference);
  if (shipment) return { text: describeShipment(shipment), actions: [] };

  const blind = blindReply();
  if (blind) return blind;

  return {
    text: `Nothing on the board matches ${reference.toUpperCase()}. References run MRD-4100 upward — check the digits, or open Shipments to scan the list.`,
    actions: [],
  };
}

function boardReply(status: Shipment["status"]): SupportReply {
  const blind = blindReply();
  if (blind) return blind;

  const matches = shipmentsByStatus(status);
  const total = allShipments().length;

  if (matches.length === 0) {
    return {
      text: `Nothing is ${STATUS_LABEL[status]} right now, across all ${total}.`,
      actions: [],
    };
  }

  const lines = matches
    .slice(0, 8)
    .map(
      (shipment) =>
        `- **${shipment.reference}** ${shipment.origin} → ${shipment.destination}, ${shipment.progress}%, ${shipment.priority}`,
    )
    .join("\n");

  const more = matches.length > 8 ? `\n\n…and ${matches.length - 8} more.` : "";

  return {
    text: `${matches.length} of ${total} ${matches.length === 1 ? "shipment is" : "shipments are"} ${STATUS_LABEL[status]}:\n\n${lines}${more}`,
    actions: [],
  };
}

function summaryReply(): SupportReply {
  const metrics = readMetrics();

  if (metrics.state === "failed") {
    return {
      text: `I can't pull the numbers — ${stop(metrics.reason)} The metrics endpoint is failing for me the same way it is for the tiles.`,
      actions: ["retryWithBackoff"],
    };
  }

  if (metrics.state === "missing") {
    return { text: "The overview hasn't loaded yet in this tab.", actions: ["retry"] };
  }

  const { inTransit, delayed, exceptions, delivered, onTimeRate } = metrics.data;
  const worry =
    exceptions > 0
      ? ` ${exceptions} ${exceptions === 1 ? "needs" : "need"} a decision.`
      : " Nothing is waiting on a decision.";

  return {
    text: `${inTransit} in transit, ${delayed} delayed, ${delivered} delivered, ${(onTimeRate * 100).toFixed(1)}% on time.${worry}`,
    actions: [],
  };
}

function triageReply(incident?: Incident): SupportReply {
  if (!incident) {
    return {
      text: "Nothing is failing — no open alarms and the API is answering. Ask me about the board, or arm a scenario from the Chaos Deck and I'll pick it up.",
      actions: [],
    };
  }

  const runbook = runbookFor(incident.kind);
  return {
    text: `${runbook.finding}. ${runbook.explain}`,
    actions: actionsFor(incident)
      .slice(0, 2)
      .map((action) => action.id),
  };
}

/**
 * The answer the rules alone can give.
 *
 * This used to be the final word on a routine ask. It now has two jobs: it is
 * what the reader sees the instant they hit enter, and it is the grounding the
 * model phrases its own answer from. The model gets the last word, but only
 * ever over facts that were looked up here — so the numbers cannot drift even
 * when the prose does.
 */
export function answerSupportIntent(intent: Intent, incident?: Incident): SupportReply | null {
  switch (intent.kind) {
    case "shipment":
      return shipmentReply(intent.reference);
    case "board":
      return boardReply(intent.status);
    case "summary":
      return summaryReply();
    case "knowledge":
      return { text: intent.answer, actions: [] };
    case "triage":
      return triageReply(incident);
    default:
      return null;
  }
}
