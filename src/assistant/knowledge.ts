/**
 * What Dispatch knows about Meridian Operations without asking the API.
 *
 * Product knowledge, not incident knowledge — the runbooks in
 * `incidents/runbooks.ts` cover the failure side. Each entry is short enough to
 * answer with verbatim, so routine questions never depend on the model.
 */
export type KnowledgeEntry = {
  id: string;
  /** Matched against the question, in order. */
  pattern: RegExp;
  /** Used as the answer outright, and as grounding when the model replies. */
  answer: string;
};

export const KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: "statuses",
    pattern:
      /\b(status(es)? mean|what (does|do) .*(status|in.?transit|exception).* mean|difference between .*status)\b/i,
    answer:
      "A shipment moves through five statuses. **Scheduled** is booked but not collected. **In transit** is on the move. **Delayed** is still moving but will miss its ETA. **Exception** needs a human decision — a refused delivery, a customs hold, damage. **Delivered** is closed.",
  },
  {
    id: "priorities",
    pattern:
      /\b(priorit(y|ies)|expedited|critical).*(mean|differ|do)|what is (an? )?(expedited|critical) (shipment|priority)\b/i,
    answer:
      "Three priorities. **Standard** books the next available capacity. **Expedited** buys a guaranteed slot and a tighter ETA. **Critical** is the one that gets a controller watching it — it pages the lane owner on any exception.",
  },
  {
    id: "create",
    pattern: /\b(how (do|can) i|how to).*(create|book|add|file|raise).*(shipment|booking)\b/i,
    answer:
      "Shipments → New shipment. You need a reference, origin, destination, carrier, weight and priority. The form submits with an idempotency key, so a double click cannot book the same load twice.",
  },
  {
    id: "outbox",
    pattern: /\b(outbox|queued writes?|offline (queue|writes?))\b/i,
    answer:
      "Writes made while the API is unreachable go to the outbox instead of failing. They are held in IndexedDB and replayed, in order and with their original idempotency keys, once the connection is back.",
  },
  {
    id: "eta",
    pattern:
      /\b(eta|estimated arrival|when will it arrive|arrival time)\b.*(calculat|come from|work|mean)|how is the eta\b/i,
    answer:
      "The ETA comes from the carrier's last position report, not from the booking. That is why it moves: a shipment can hold its status and still slip its ETA between two refreshes.",
  },
  {
    id: "lanes",
    pattern: /\b(what (is|are)|explain).*(lanes?)\b|lanes? (panel|by volume)\b/i,
    answer:
      "A lane is an origin–destination pair. Lanes by volume ranks them by how many active shipments are on each, with the bar showing average progress across that lane.",
  },
  {
    id: "ontime",
    pattern: /\b(on.?time rate|on time %|otr)\b/i,
    answer:
      "On-time rate is delivered-by-ETA over all shipments closed in the window. It counts only closed shipments, so a delayed load in flight does not move it until it lands.",
  },
  {
    id: "vitals",
    pattern: /\b(vitals?|hr|spo2|bp|resp|temp)\b.*(mean|strip|reading)|what is the vitals strip\b/i,
    answer:
      "The strip along the top is the app's own health, borrowed from a patient monitor. HR is request rate, SpO₂ is the share of requests succeeding, BP is latency (p50 over p95), RESP is live-feed events per minute, TEMP is heap use. They describe the client, not the freight.",
  },
  {
    id: "chaos-deck",
    pattern: /\b(chaos deck|arm a (fault|scenario)|break (the app|something)|chaos monkey)\b/i,
    answer:
      "The Chaos Deck is behind the Chaos button in the header. Each card arms a real fault in the API layer — an outage, latency, a schema change — and the app reacts as it would in production. The monkey arms and disarms them for you on a timer.",
  },
  {
    id: "who",
    pattern: /\b(who are you|what (can|do) you do|help me|what are you)\b/i,
    answer:
      "I am Dispatch. Day to day I answer questions about the board — where a shipment is, what a status means, how to book a load — and I can drive the app for you: open a page, pull up a shipment, switch the theme, show the Chaos Deck. When something breaks I switch to triage: I read the alarms and the request log, tell you what failed, and offer the fix.",
  },
];

export function findKnowledge(question: string): KnowledgeEntry | undefined {
  return KNOWLEDGE.find((entry) => entry.pattern.test(question));
}

/** The entries worth putting in front of the model for this question. */
export function knowledgeContext(question: string): string {
  const hit = findKnowledge(question);
  if (!hit) return "";
  return `PRODUCT KNOWLEDGE (use this verbatim where it answers the question)\n${hit.answer}`;
}
