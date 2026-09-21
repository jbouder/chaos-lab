import type { RemediationId } from "@/incidents/types";

export type Intent =
  | { kind: "action"; action: RemediationId; reply: string }
  | { kind: "triage" }
  | { kind: "none" };

const RULES: Array<{ pattern: RegExp; intent: Intent }> = [
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
  {
    pattern: /\b(what (just )?happened|what(’|')?s wrong|what is wrong|status)\b/i,
    intent: { kind: "triage" },
  },
];

/**
 * A deterministic router in front of the model. Common asks resolve instantly
 * and identically every time, which matters more than sounding clever.
 */
export function detectIntent(input: string): Intent {
  for (const rule of RULES) {
    if (rule.pattern.test(input)) return rule.intent;
  }
  return { kind: "none" };
}
