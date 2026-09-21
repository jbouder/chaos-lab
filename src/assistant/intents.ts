import type { RemediationId } from "@/incidents/types";
import type { Shipment } from "@/victim/api/schemas";
import { findKnowledge } from "./knowledge";

export type Intent =
  | { kind: "action"; action: RemediationId; reply: string }
  | { kind: "shipment"; reference: string }
  | { kind: "board"; status: Shipment["status"] }
  | { kind: "summary" }
  | { kind: "knowledge"; answer: string }
  | { kind: "triage" }
  | { kind: "none" };

/** A booking reference as the seed data writes them, typed loosely. */
const REFERENCE = /\b(mrd)[\s-]?(\d{3,5})\b/i;

const BOARD: Array<{ pattern: RegExp; status: Shipment["status"] }> = [
  { pattern: /\b(delayed|running late|behind schedule|late)\b/i, status: "delayed" },
  { pattern: /\b(exceptions?|needs? (a )?decision|held|stuck)\b/i, status: "exception" },
  { pattern: /\b(in.?transit|on the move|moving|en route)\b/i, status: "in-transit" },
  { pattern: /\b(delivered|completed|closed)\b/i, status: "delivered" },
  { pattern: /\b(scheduled|booked|not (yet )?collected)\b/i, status: "scheduled" },
];

const ACTIONS: Array<{ pattern: RegExp; intent: Intent }> = [
  {
    pattern: /\b(make it stop|turn it off|stop the (chaos|fault)|disarm)\b/i,
    intent: {
      kind: "action",
      action: "disarmAll",
      reply: "Stopping every armed scenario and letting the app settle.",
    },
  },
  {
    pattern: /\b(retry|try again)\b/i,
    intent: { kind: "action", action: "retry", reply: "Re-running the failed requests." },
  },
  {
    pattern: /\b(reload|refresh the page)\b/i,
    intent: { kind: "action", action: "reloadOnce", reply: "Reloading once, with a loop guard." },
  },
  {
    pattern: /\bclear (the )?(app )?cache\b/i,
    intent: {
      kind: "action",
      action: "clearAppCache",
      reply: "Clearing cached responses and local ballast.",
    },
  },
  {
    pattern: /\b(reconnect|reconnect the feed)\b/i,
    intent: { kind: "action", action: "reconnectFeed", reply: "Reconnecting the live feed now." },
  },
  {
    pattern: /\b(copy|export) (the )?diagnostics\b/i,
    intent: { kind: "action", action: "exportDiagnostics", reply: "Copying a diagnostics bundle." },
  },
  {
    pattern: /\b(replay|flush) (the )?(outbox|queue)\b/i,
    intent: {
      kind: "action",
      action: "replayOutbox",
      reply: "Replaying everything queued offline.",
    },
  },
];

const TRIAGE =
  /\b(what (just )?happened|what'?s wrong|what is wrong|why did .* fail|any (alarms|incidents))\b/i;
const SUMMARY =
  /\b(how (are|is) (we|things|the board) (doing|looking)|summar(y|ise|ize)|overview|where do we stand)\b/i;

/**
 * A deterministic router in front of the model. Routine asks — a reference
 * lookup, a board filter, a definition — resolve instantly and identically
 * every time, which matters more than sounding clever. Only the open-ended
 * questions reach the model.
 */
export function detectIntent(input: string): Intent {
  const reference = input.match(REFERENCE);
  if (reference) return { kind: "shipment", reference: `${reference[1]}-${reference[2]}` };

  for (const rule of ACTIONS) {
    if (rule.pattern.test(input)) return rule.intent;
  }

  if (TRIAGE.test(input)) return { kind: "triage" };
  if (SUMMARY.test(input)) return { kind: "summary" };

  // "which shipments are delayed" — a filter, not a definition.
  if (/\b(which|what|list|show|any|how many)\b/i.test(input)) {
    for (const rule of BOARD) {
      if (rule.pattern.test(input)) return { kind: "board", status: rule.status };
    }
  }

  const known = findKnowledge(input);
  if (known) return { kind: "knowledge", answer: known.answer };

  return { kind: "none" };
}
