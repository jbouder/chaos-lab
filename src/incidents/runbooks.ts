import type { IncidentKind, RemediationId, Severity } from "./types";

export type Runbook = {
  kind: IncidentKind;
  /** Monitor-register one-liner shown on the triage card. */
  finding: string;
  /** What a person should understand, in plain language. */
  explain: string;
  /** Ordered steps a human can follow without the model. */
  userSteps: string[];
  /** Compact grounding injected into the model prompt. */
  llmNotes: string;
  preferredActions: RemediationId[];
  severity: Severity;
};

const RUNBOOKS: Record<IncidentKind, Runbook> = {
  outage: {
    kind: "outage",
    finding: "The server is refusing every request",
    explain:
      "The API answered with 503 Service Unavailable. Nothing you typed caused this and retrying instantly will not help — the server is telling us how long to wait.",
    userSteps: [
      "Wait for the Retry-After window instead of clicking repeatedly.",
      "Retry once the countdown reaches zero.",
      "If it still fails after a few backed-off retries, the outage is upstream.",
    ],
    llmNotes:
      "HTTP 503 with a Retry-After header. Correct handling: exponential backoff with jitter, honour Retry-After, do not hammer. User cannot fix the server; they can wait or work offline.",
    preferredActions: ["retryWithBackoff", "disarmScenario"],
    severity: "critical",
  },
  flaky: {
    kind: "flaky",
    finding: "Some requests are failing, others succeed",
    explain:
      "A fraction of calls are erroring. A circuit breaker trips after repeated failures so we stop sending doomed requests, then sends one probe to test recovery.",
    userSteps: [
      "Let the breaker open rather than retrying manually.",
      "Send a single probe to see if the upstream recovered.",
      "Reduce the failure rate in the Chaos Deck to confirm recovery.",
    ],
    llmNotes:
      "Intermittent 500s. Circuit breaker states: closed (normal), open (short-circuiting, cooldown running), half-open (one probe allowed). Retrying every request during 'open' defeats the purpose.",
    preferredActions: ["probeCircuit", "retryWithBackoff", "disarmScenario"],
    severity: "error",
  },
  slow: {
    kind: "slow",
    finding: "Responses are arriving far later than normal",
    explain:
      "Requests are completing, just slowly. Long waits are usually worse than a clean failure because the interface looks alive while nothing is happening.",
    userSteps: [
      "Cancel the in-flight request if you no longer need it.",
      "Retry — a single slow response is often a one-off.",
      "Lower the injected latency to confirm the page recovers.",
    ],
    llmNotes:
      "High latency, no errors. Good handling: skeletons, an AbortController timeout, and 'still working' copy after ~3s. Cancelling frees the connection; retrying may hit a faster path.",
    preferredActions: ["cancelInflight", "retry", "disarmScenario"],
    severity: "warning",
  },
  offline: {
    kind: "offline",
    finding: "The device has no connection",
    explain:
      "The browser reports it is offline. Reads fall back to cached data and anything you submit is queued locally until the connection returns.",
    userSteps: [
      "Keep working — writes are saved to a local outbox.",
      "Reconnect, then replay the outbox to send queued changes.",
      "Nothing is lost while the queue is intact.",
    ],
    llmNotes:
      "navigator.onLine is false and fetches reject. Mutations are queued in an outbox and replayed on reconnect. Reassure the user their work is saved locally.",
    preferredActions: ["replayOutbox", "disarmScenario"],
    severity: "error",
  },
  "rate-limited": {
    kind: "rate-limited",
    finding: "The API is throttling us",
    explain:
      "We sent more requests than the allowance permits, so the server replied 429. The allowance refills over time; the fix is to wait for the bucket, not to retry harder.",
    userSteps: [
      "Stop issuing new requests for a moment.",
      "Wait for the token bucket to refill, then retry once.",
      "Avoid rapid repeated refreshes.",
    ],
    llmNotes:
      "HTTP 429 Too Many Requests with Retry-After. Token bucket: capacity refills at a fixed rate. The only correct action is to wait then retry once.",
    preferredActions: ["retryWithBackoff", "disarmScenario"],
    severity: "warning",
  },
  "network-error": {
    kind: "network-error",
    finding: "The request never reached the server",
    explain:
      "The browser threw a bare network error. This is what CORS rejections, DNS failures and blocked requests look like from JavaScript — the response is invisible to us, so we cannot say more from the client.",
    userSteps: [
      "This is a server or network configuration problem, not something you can fix in the page.",
      "Copy the diagnostics and send them to whoever runs the API.",
      "Check whether an extension or proxy is blocking the request.",
    ],
    llmNotes:
      "TypeError 'Failed to fetch'. The browser hides the real cause (CORS preflight failure, DNS, offline, blocked). Do not guess a status code. Recommend exporting diagnostics for the API owner.",
    preferredActions: ["exportDiagnostics", "retry", "disarmScenario"],
    severity: "error",
  },
  "schema-drift": {
    kind: "schema-drift",
    finding: "The response did not match the expected shape",
    explain:
      "The API returned data whose fields differ from what this build expects — typically a field renamed or removed on the server without a client release.",
    userSteps: [
      "Nothing you can change in the page will fix the mismatch.",
      "Render the affected rows with fallback values to keep working.",
      "Report the exact field name to the API team.",
    ],
    llmNotes:
      "Zod validation failed. context.issues lists the failing paths. Name the exact field. This is a contract break between client and server, usually a deploy skew.",
    preferredActions: ["exportDiagnostics", "disarmScenario"],
    severity: "error",
  },
  "partial-failure": {
    kind: "partial-failure",
    finding: "One panel failed while the rest are healthy",
    explain:
      "A single endpoint is down. The rest of the page is unaffected, so the app degrades instead of showing one global error.",
    userSteps: [
      "Keep using the healthy panels.",
      "Retry just the failed panel.",
      "Only the affected data is stale.",
    ],
    llmNotes:
      "Isolated endpoint failure. Emphasise which parts still work. Retry should be scoped to the failing query, not the whole page.",
    preferredActions: ["retry", "disarmScenario"],
    severity: "warning",
  },
  "chunk-load": {
    kind: "chunk-load",
    finding: "A piece of the app failed to download",
    explain:
      "A lazily loaded chunk 404'd. This almost always means a new version was deployed while this tab was open, so the file this page is asking for no longer exists.",
    userSteps: [
      "Reload once to pick up the new build.",
      "If reloading loops, clear the app cache.",
      "Do not keep clicking the failing link.",
    ],
    llmNotes:
      "Dynamic import failure after a deploy. Correct fix is a single guarded reload. Warn against reload loops; a guard allows only one automatic reload.",
    preferredActions: ["reloadOnce", "clearAppCache"],
    severity: "error",
  },
  "version-skew": {
    kind: "version-skew",
    finding: "This tab is running an older build",
    explain:
      "The server reports a newer app version than the one this tab loaded. Mixed versions cause odd, hard-to-reproduce behaviour.",
    userSteps: [
      "Finish or save what you are doing.",
      "Reload to move to the current build.",
      "Clear the cache if the old version keeps coming back.",
    ],
    llmNotes:
      "Server X-App-Version is newer than the client build. Not yet broken, but reload is advised. Preserve unsaved work before reloading.",
    preferredActions: ["reloadOnce", "clearAppCache"],
    severity: "warning",
  },
  "duplicate-submit": {
    kind: "duplicate-submit",
    finding: "The same record was created twice",
    explain:
      "Two identical writes landed because the form was submitted more than once. An idempotency key lets the server recognise a repeat and return the original result instead of creating a second record.",
    userSteps: [
      "Remove the duplicate.",
      "Enable idempotency keys so repeats collapse server-side.",
      "The button also disables itself while a submit is in flight.",
    ],
    llmNotes:
      "Duplicate POST. Fix is an Idempotency-Key header plus disabling the submit control while pending. Offer to delete the duplicate.",
    preferredActions: ["dedupeSubmits", "disarmScenario"],
    severity: "warning",
  },
  "session-expired": {
    kind: "session-expired",
    finding: "The session timed out",
    explain:
      "The API rejected the request with 401. The silent refresh failed, so a new sign-in is needed. Anything typed into an open form has been saved as a draft first.",
    userSteps: [
      "Sign in again.",
      "Your in-progress form is preserved and restored afterwards.",
      "Retry the action once the session is fresh.",
    ],
    llmNotes:
      "HTTP 401 after a failed token refresh. Reassure: drafts are saved. Distinguish clearly from 403 (authenticated but not permitted).",
    preferredActions: ["refreshSession", "saveDraftAndReauth"],
    severity: "error",
  },
  "clock-skew": {
    kind: "clock-skew",
    finding: "This device's clock is wrong",
    explain:
      "The token looks 'not yet valid' to the server because the device clock is ahead or behind. Auth depends on both sides agreeing roughly on the time.",
    userSteps: [
      "Check the device date and time settings.",
      "Turn on automatic time synchronisation.",
      "Retry once the clock is corrected.",
    ],
    llmNotes:
      "Token nbf/iat rejected due to client clock offset (context.skewMs). This is a genuinely confusing failure: the fix lives in OS settings, not the app.",
    preferredActions: ["syncClock", "refreshSession"],
    severity: "error",
  },
  forbidden: {
    kind: "forbidden",
    finding: "Signed in, but not allowed",
    explain:
      "The server answered 403. The session is valid — this account simply lacks permission for that action, usually because a role changed while the tab was open.",
    userSteps: [
      "You do not need to sign in again.",
      "Ask an administrator for the required role.",
      "Reload to pick up a role that was just granted.",
    ],
    llmNotes:
      "HTTP 403, not 401. Do not suggest re-authenticating as the fix. Explain the difference between identity and permission.",
    preferredActions: ["reloadOnce", "exportDiagnostics"],
    severity: "error",
  },
  "render-crash": {
    kind: "render-crash",
    finding: "A panel crashed while drawing",
    explain:
      "A component threw during render, so an error boundary caught it and replaced just that panel. The rest of the page kept running.",
    userSteps: [
      "Retry the panel — transient crashes often clear.",
      "If it crashes again immediately, reset that panel's state.",
      "Reload only as a last resort.",
    ],
    llmNotes:
      "React render error caught by an ErrorBoundary. context.componentStack names the component. Summarise the error message in plain words; do not paste the raw stack.",
    preferredActions: ["resetPanelState", "reloadOnce"],
    severity: "error",
  },
  "unhandled-rejection": {
    kind: "unhandled-rejection",
    finding: "A background task failed silently",
    explain:
      "A promise rejected with nobody listening. Nothing visibly broke, which is exactly why this class of bug hides — data may be quietly stale.",
    userSteps: [
      "Check whether the data you are looking at is current.",
      "Retry the affected action.",
      "Report it: silent failures rarely surface any other way.",
    ],
    llmNotes:
      "window 'unhandledrejection'. No user-visible symptom. Explain the risk of stale state rather than implying the page is broken.",
    preferredActions: ["retry", "exportDiagnostics"],
    severity: "warning",
  },
  "render-loop": {
    kind: "render-loop",
    finding: "A panel is re-rendering without stopping",
    explain:
      "An effect is updating state that re-triggers the same effect. A guard stopped the panel before it locked up the tab.",
    userSteps: [
      "Reset that panel's state to break the cycle.",
      "Avoid interacting with the panel until it is reset.",
      "Reload if the guard cannot recover it.",
    ],
    llmNotes:
      "Runaway useEffect → setState cycle, stopped by a render-count guard (context.renders). Typical cause: a dependency recreated on every render.",
    preferredActions: ["resetPanelState", "reloadOnce"],
    severity: "error",
  },
  "corrupt-state": {
    kind: "corrupt-state",
    finding: "Saved settings could not be read",
    explain:
      "The preferences stored in this browser are malformed, so the app could not restore them. This usually follows an interrupted write or a version change.",
    userSteps: [
      "Export a copy of the saved data first.",
      "Reset saved settings to defaults.",
      "Re-apply the few preferences you care about.",
    ],
    llmNotes:
      "JSON.parse failed on persisted localStorage state. Always offer an export before a destructive reset.",
    preferredActions: ["exportDiagnostics", "resetSavedSettings"],
    severity: "error",
  },
  "quota-exceeded": {
    kind: "quota-exceeded",
    finding: "Browser storage is full",
    explain:
      "A write threw QuotaExceededError. The browser gives each site a limited budget and this one is exhausted, so nothing new can be cached or saved.",
    userSteps: [
      "Clear the app cache to reclaim space.",
      "Retry the action afterwards.",
      "Persistent recurrence means something is writing unbounded data.",
    ],
    llmNotes:
      "QuotaExceededError on localStorage/IndexedDB. Clearing app cache is safe; it does not remove server data.",
    preferredActions: ["clearAppCache", "retry"],
    severity: "error",
  },
  "main-thread-freeze": {
    kind: "main-thread-freeze",
    finding: "The interface stopped responding",
    explain:
      "A long task blocked the main thread, so clicks, typing and animation all stalled. The browser was busy running one piece of JavaScript.",
    userSteps: [
      "Wait for the task to finish — input is queued, not lost.",
      "Run the same work in a Web Worker to keep the page responsive.",
      "Avoid repeating the blocking action.",
    ],
    llmNotes:
      "PerformanceObserver longtask over 200ms (context.durationMs). Fix is moving the work off the main thread into a Worker; explain why the UI froze rather than crashed.",
    preferredActions: ["runInWorker", "disarmScenario"],
    severity: "warning",
  },
  "memory-leak": {
    kind: "memory-leak",
    finding: "Memory use keeps climbing",
    explain:
      "Something is allocating and never releasing — usually timers or subscriptions that outlive the component that made them. Left alone the tab eventually becomes unusable.",
    userSteps: [
      "Stop the leaking timers.",
      "Reload to reclaim memory that has already leaked.",
      "Watch the temperature reading settle afterwards.",
    ],
    llmNotes:
      "Heap growth detected over a sliding window (context.growthMbPerMin). Classic cause: setInterval without clearInterval on unmount.",
    preferredActions: ["stopLeaks", "reloadOnce"],
    severity: "warning",
  },
  "feed-disconnected": {
    kind: "feed-disconnected",
    finding: "The live feed dropped",
    explain:
      "The realtime connection closed. The page is no longer receiving events, so what you see is frozen at the last update rather than wrong.",
    userSteps: [
      "Reconnect — backoff is already scheduling attempts.",
      "Switch to polling if the socket keeps dropping.",
      "Check the 'last event' reading to see how stale the view is.",
    ],
    llmNotes:
      "WebSocket closed; reconnect uses exponential backoff with jitter. Distinguish 'stale' from 'wrong'. Polling is the fallback transport.",
    preferredActions: ["reconnectFeed", "switchToPolling", "disarmScenario"],
    severity: "error",
  },
  unknown: {
    kind: "unknown",
    finding: "Something went wrong",
    explain: "An error was captured that does not match a known pattern.",
    userSteps: ["Retry the action.", "Export diagnostics if it repeats."],
    llmNotes: "Unclassified error. Ask a clarifying question before recommending an action.",
    preferredActions: ["retry", "exportDiagnostics"],
    severity: "error",
  },
};

export function runbookFor(kind: IncidentKind): Runbook {
  return RUNBOOKS[kind] ?? RUNBOOKS.unknown;
}

export const allRunbooks = Object.values(RUNBOOKS);
