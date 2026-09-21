export type Severity = "info" | "warning" | "error" | "critical";

export type IncidentSource =
  | "fetch"
  | "boundary"
  | "window"
  | "perf"
  | "storage"
  | "realtime"
  | "connectivity"
  | "chaos";

export type IncidentKind =
  | "outage"
  | "flaky"
  | "slow"
  | "offline"
  | "rate-limited"
  | "network-error"
  | "schema-drift"
  | "partial-failure"
  | "chunk-load"
  | "version-skew"
  | "duplicate-submit"
  | "session-expired"
  | "clock-skew"
  | "forbidden"
  | "render-crash"
  | "unhandled-rejection"
  | "render-loop"
  | "corrupt-state"
  | "quota-exceeded"
  | "main-thread-freeze"
  | "memory-leak"
  | "feed-disconnected"
  | "unknown";

export type RemediationId =
  | "retry"
  | "retryWithBackoff"
  | "cancelInflight"
  | "reloadOnce"
  | "clearAppCache"
  | "resetPanelState"
  | "resetSavedSettings"
  | "exportDiagnostics"
  | "refreshSession"
  | "saveDraftAndReauth"
  | "replayOutbox"
  | "probeCircuit"
  | "switchToPolling"
  | "reconnectFeed"
  | "runInWorker"
  | "stopLeaks"
  | "dedupeSubmits"
  | "syncClock"
  | "disarmScenario"
  | "disarmAll";

export type IncidentStatus = "open" | "mitigating" | "resolved" | "gave-up";

export type Attempt = {
  actionId: RemediationId;
  at: number;
  outcome: "ok" | "failed";
  note?: string;
};

export type Incident = {
  id: string;
  kind: IncidentKind;
  severity: Severity;
  source: IncidentSource;
  title: string;
  detail: string;
  at: number;
  updatedAt: number;
  /** Repeat count when the same failure keeps firing. */
  count: number;
  /** Stable identity used to fold repeats into one entry. */
  fingerprint: string;
  context: Record<string, unknown>;
  scenarioId?: string;
  status: IncidentStatus;
  actions: RemediationId[];
  attempts: Attempt[];
  acknowledged: boolean;
};

export type IncidentInput = {
  kind: IncidentKind;
  severity?: Severity;
  source: IncidentSource;
  title: string;
  detail: string;
  context?: Record<string, unknown>;
  scenarioId?: string;
  fingerprint?: string;
  actions?: RemediationId[];
};

export const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

/** Monitor-style alarm tiers. Severity is the model; this is the vocabulary. */
export const ALARM_LABEL: Record<Severity, string> = {
  info: "Note",
  warning: "Advisory",
  error: "Caution",
  critical: "Crisis",
};
