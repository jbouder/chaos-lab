import { reportIncident, resolveKind } from "@/incidents/bus";
import { apiBreaker } from "@/lib/circuitBreaker";
import { armFault, disarmFault } from "@/mocks/faults";
import type { ScenarioDefinition } from "../registry";
import { forceOffline, restoreOnline, setDuplicateSubmit } from "../runtimeState";

export const networkScenarios: ScenarioDefinition[] = [
  {
    id: "outage",
    title: "Hard outage",
    category: "network",
    kind: "outage",
    severity: "critical",
    symptom: "Every API call returns 503 with a Retry-After header.",
    lesson:
      "A server that tells you when to come back deserves to be obeyed. Backoff with jitter beats a retry loop, and the interface should show the wait rather than a dead spinner.",
    knobs: [
      {
        id: "retryAfter",
        label: "Retry-After",
        min: 2,
        max: 60,
        step: 1,
        defaultValue: 12,
        unit: "s",
      },
    ],
    arm: ({ knob }) =>
      armFault({
        id: "outage",
        scope: "all",
        fault: {
          kind: "status",
          status: 503,
          headers: { "Retry-After": String(knob("retryAfter")) },
          message: "Service temporarily unavailable",
        },
      }),
    disarm: () => {
      disarmFault("outage");
      apiBreaker.reset();
      resolveKind("outage", "The API is answering again.");
    },
  },
  {
    id: "flaky",
    title: "Flaky upstream",
    category: "network",
    kind: "flaky",
    severity: "error",
    symptom: "A share of requests fail with 500 while the rest succeed.",
    lesson:
      "Intermittent failure is where circuit breakers earn their keep: stop sending doomed requests, wait out a cooldown, then probe once before reopening the floodgates.",
    knobs: [
      { id: "rate", label: "Failure rate", min: 10, max: 95, step: 5, defaultValue: 55, unit: "%" },
    ],
    arm: ({ knob }) =>
      armFault({
        id: "flaky",
        scope: "all",
        fault: { kind: "status", status: 500, rate: knob("rate") / 100 },
      }),
    disarm: () => {
      disarmFault("flaky");
      apiBreaker.reset();
      resolveKind("flaky", "The upstream stopped failing.");
    },
  },
  {
    id: "latency",
    title: "Latency spike",
    category: "network",
    kind: "slow",
    severity: "warning",
    symptom: "Responses arrive seconds late, with no errors at all.",
    lesson:
      "Slow is harder than broken. Every request needs a timeout, a way to cancel, and copy that admits the wait instead of spinning silently.",
    knobs: [
      {
        id: "delay",
        label: "Added latency",
        min: 500,
        max: 15000,
        step: 250,
        defaultValue: 6000,
        unit: "ms",
      },
      {
        id: "jitter",
        label: "Jitter",
        min: 0,
        max: 5000,
        step: 250,
        defaultValue: 1500,
        unit: "ms",
      },
    ],
    arm: ({ knob }) =>
      armFault({
        id: "latency",
        scope: "all",
        fault: { kind: "latency", ms: knob("delay"), jitter: knob("jitter") },
      }),
    disarm: () => {
      disarmFault("latency");
      resolveKind("slow", "Latency is back to normal.");
    },
  },
  {
    id: "offline",
    title: "Connection lost",
    category: "network",
    kind: "offline",
    severity: "error",
    symptom: "The browser goes offline; writes queue in a local outbox.",
    lesson:
      "Offline is a state, not an error. Reads fall back to cache, writes go to a durable queue, and the queue replays when the connection returns.",
    arm: () => {
      forceOffline();
      armFault({ id: "offline", scope: "all", fault: { kind: "offline" } });
    },
    disarm: () => {
      disarmFault("offline");
      restoreOnline();
      resolveKind("offline", "The connection came back.");
    },
  },
  {
    id: "rate-limit",
    title: "Rate limited",
    category: "network",
    kind: "rate-limited",
    severity: "warning",
    symptom: "After a few quick requests the API starts answering 429.",
    lesson:
      "A token bucket refills at a fixed rate. Retrying faster empties it faster; the only winning move is to wait for the refill.",
    knobs: [
      { id: "capacity", label: "Bucket size", min: 2, max: 20, step: 1, defaultValue: 5 },
      { id: "refill", label: "Refill rate", min: 1, max: 10, step: 1, defaultValue: 1, unit: "/s" },
    ],
    arm: ({ knob }) =>
      armFault({
        id: "rate-limit",
        scope: "all",
        fault: { kind: "rateLimit", capacity: knob("capacity"), refillPerSec: knob("refill") / 10 },
      }),
    disarm: () => {
      disarmFault("rate-limit");
      resolveKind("rate-limited", "The throttle was lifted.");
    },
  },
  {
    id: "network-error",
    title: "Blocked at the transport",
    category: "network",
    kind: "network-error",
    severity: "error",
    symptom: "Requests fail with a bare 'Failed to fetch' and no status code.",
    lesson:
      "This is what CORS rejections, DNS failures and blocking extensions look like from JavaScript. The browser hides the cause on purpose, so guessing at a status code is a mistake.",
    arm: () =>
      armFault({ id: "network-error", scope: "all", fault: { kind: "networkError", rate: 1 } }),
    disarm: () => {
      disarmFault("network-error");
      apiBreaker.reset();
      resolveKind("network-error", "Requests are reaching the server again.");
    },
  },
  {
    id: "schema-drift",
    title: "Schema drift",
    category: "network",
    kind: "schema-drift",
    severity: "error",
    symptom: "The API renames `eta` to `estimatedArrival` and validation fails.",
    lesson:
      "Validate at the boundary and you get the exact field name that broke. Skip validation and you get `undefined` rendered three components deep.",
    arm: () => armFault({ id: "schema-drift", scope: "shipments", fault: { kind: "schemaDrift" } }),
    disarm: () => {
      disarmFault("schema-drift");
      resolveKind("schema-drift", "The response shape matches the contract again.");
    },
  },
  {
    id: "partial-failure",
    title: "One panel down",
    category: "network",
    kind: "partial-failure",
    severity: "warning",
    symptom: "The lane breakdown fails while every other panel keeps working.",
    lesson:
      "Failure should be scoped to the thing that failed. One dead endpoint must not take the whole page down with it.",
    arm: () =>
      armFault({
        id: "partial-failure",
        scope: "lanes",
        fault: { kind: "status", status: 500, message: "Lane aggregation failed" },
      }),
    disarm: () => {
      disarmFault("partial-failure");
      resolveKind("partial-failure", "The lane panel recovered.");
    },
  },
  {
    id: "chunk-load",
    title: "Deploy mid-session",
    category: "network",
    kind: "chunk-load",
    severity: "error",
    oneShot: true,
    symptom: "A lazily loaded piece of the app 404s, as if a deploy replaced it.",
    lesson:
      "When the files a tab is asking for no longer exist, exactly one guarded reload fixes it. An unguarded reload-on-error is how you build a reload loop.",
    arm: async () => {
      try {
        await import(/* @vite-ignore */ `/assets/panel-${Date.now()}.js`);
      } catch (error) {
        reportIncident({
          kind: "chunk-load",
          source: "window",
          title: "Part of the app failed to load",
          detail:
            error instanceof Error ? error.message : "Failed to fetch dynamically imported module.",
          context: { hint: "A new version was deployed while this tab was open." },
          fingerprint: "chunk-load",
          scenarioId: "chunk-load",
        });
      }
    },
  },
  {
    id: "version-skew",
    title: "Version skew",
    category: "network",
    kind: "version-skew",
    severity: "warning",
    symptom: "The API reports a newer build than this tab is running.",
    lesson:
      "Mixed versions produce bugs nobody can reproduce. Detect the skew, say so plainly, and let the user reload when their work is safe.",
    arm: () =>
      armFault({
        id: "version-skew",
        scope: "all",
        fault: { kind: "versionSkew", version: "2026.10.0" },
      }),
    disarm: () => {
      disarmFault("version-skew");
      resolveKind("version-skew", "Client and server are on the same build.");
    },
  },
  {
    id: "duplicate-submit",
    title: "Double submit",
    category: "network",
    kind: "duplicate-submit",
    severity: "warning",
    symptom: "Creating a shipment sends the request twice and both land.",
    lesson:
      "Disabling the button is the easy half. The server also needs an idempotency key so a retried write returns the original record instead of a second one.",
    arm: () => {
      armFault({ id: "duplicate-submit", scope: "mutations", fault: { kind: "allowDuplicates" } });
      setDuplicateSubmit(true);
    },
    disarm: () => {
      disarmFault("duplicate-submit");
      setDuplicateSubmit(false);
      resolveKind("duplicate-submit", "Idempotency keys are being honoured again.");
    },
  },
];
