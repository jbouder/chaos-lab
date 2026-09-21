import type { ZodType } from "zod";
import { reportIncident } from "@/incidents/bus";
import { recordTrace } from "@/incidents/networkTrace";
import type { IncidentKind } from "@/incidents/types";
import { parseRetryAfter } from "@/lib/backoff";
import { apiBreaker } from "@/lib/circuitBreaker";
import { uid } from "@/lib/ids";
import { APP_VERSION } from "@/mocks/faults";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: IncidentKind,
    readonly context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type RequestOptions = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  idempotencyKey?: string;
  /** Label used in incident titles, e.g. "shipments". */
  resource?: string;
  /** Set false for background probes that should not raise incidents. */
  report?: boolean;
};

const DEFAULT_TIMEOUT = 12_000;

function classify(status: number, headers: Headers): IncidentKind {
  if (status === 503) return "outage";
  if (status === 429) return "rate-limited";
  if (status === 403) return "forbidden";
  if (status === 401) {
    return headers.get("X-Auth-Reason") === "token-not-yet-valid"
      ? "clock-skew"
      : "session-expired";
  }
  if (status >= 500) return "flaky";
  return "unknown";
}

function titleFor(kind: IncidentKind, resource: string, status: number): string {
  switch (kind) {
    case "outage":
      return `${resource} unavailable (503)`;
    case "rate-limited":
      return `${resource} throttled (429)`;
    case "forbidden":
      return `${resource} forbidden (403)`;
    case "session-expired":
      return "Session expired (401)";
    case "clock-skew":
      return "Authentication failed: device clock";
    case "flaky":
      return `${resource} failed (${status})`;
    default:
      return `${resource} request failed (${status})`;
  }
}

/**
 * The single door every API call goes through. It times the request, records
 * it on the network trace, drives the circuit breaker, validates the payload
 * and translates whatever went wrong into an incident the Medic can reason
 * about.
 */
export async function apiFetch<T>(
  path: string,
  schema: ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = "GET",
    body,
    signal,
    timeoutMs = DEFAULT_TIMEOUT,
    idempotencyKey,
    resource = path.replace("/api/", ""),
    report = true,
  } = options;

  if (!apiBreaker.canRequest()) {
    const error = new ApiError("Circuit breaker is open", 0, "flaky", { breaker: "open" });
    if (report) {
      reportIncident({
        kind: "flaky",
        source: "fetch",
        severity: "warning",
        title: "Request blocked by the circuit breaker",
        detail:
          "Repeated failures tripped the breaker, so this request was short-circuited instead of being sent.",
        context: { path, breaker: "open" },
        fingerprint: "breaker-open",
      });
    }
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new DOMException("Timeout", "TimeoutError")),
    timeoutMs,
  );
  signal?.addEventListener("abort", () => controller.abort(signal.reason), { once: true });

  const startedAt = Date.now();
  const traceId = uid("req");

  try {
    const response = await fetch(path, {
      method,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        "X-Client-Version": APP_VERSION,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      apiBreaker.recordFailure();
      const kind = classify(response.status, response.headers);
      const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      recordTrace({
        id: traceId,
        method,
        url: path,
        startedAt,
        durationMs,
        status: response.status,
        outcome: "error",
        note: payload.error,
      });

      if (report) {
        reportIncident({
          kind,
          source: "fetch",
          title: titleFor(kind, resource, response.status),
          detail: payload.error ?? `The server responded ${response.status}.`,
          context: {
            path,
            method,
            status: response.status,
            retryAfterMs: retryAfter,
            durationMs,
            breaker: apiBreaker.snapshot().state,
          },
          fingerprint: `${kind}:${path}`,
        });
      }

      throw new ApiError(
        payload.error ?? `Request failed (${response.status})`,
        response.status,
        kind,
        {
          retryAfterMs: retryAfter,
          path,
        },
      );
    }

    const serverVersion = response.headers.get("X-App-Version");
    if (report && serverVersion && serverVersion !== APP_VERSION) {
      reportIncident({
        kind: "version-skew",
        source: "fetch",
        title: "A newer build is available",
        detail: `This tab is running ${APP_VERSION}; the API is serving ${serverVersion}.`,
        context: { clientVersion: APP_VERSION, serverVersion },
        fingerprint: `version-skew:${serverVersion}`,
      });
    }

    const json = await response.json();
    const parsed = schema.safeParse(json);

    if (!parsed.success) {
      apiBreaker.recordSuccess();
      const issues = parsed.error.issues.slice(0, 4).map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));

      recordTrace({
        id: traceId,
        method,
        url: path,
        startedAt,
        durationMs,
        status: response.status,
        outcome: "error",
        note: "schema mismatch",
      });

      if (report) {
        reportIncident({
          kind: "schema-drift",
          source: "fetch",
          title: `${resource} response did not match the contract`,
          detail: issues.map((issue) => `${issue.path || "(root)"}: ${issue.message}`).join("; "),
          context: { path, issues },
          fingerprint: `schema-drift:${path}`,
        });
      }

      throw new ApiError("Response failed validation", response.status, "schema-drift", { issues });
    }

    apiBreaker.recordSuccess();
    recordTrace({
      id: traceId,
      method,
      url: path,
      startedAt,
      durationMs,
      status: response.status,
      outcome: "ok",
    });

    if (report && durationMs > 3000) {
      reportIncident({
        kind: "slow",
        source: "fetch",
        severity: "warning",
        title: `${resource} responded slowly`,
        detail: `The request took ${(durationMs / 1000).toFixed(1)}s.`,
        context: { path, durationMs },
        fingerprint: `slow:${path}`,
      });
    }

    return parsed.data;
  } catch (error) {
    const durationMs = Date.now() - startedAt;

    if (error instanceof ApiError) throw error;

    const aborted = error instanceof DOMException && error.name === "AbortError";
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";

    if (aborted && !timedOut) {
      recordTrace({
        id: traceId,
        method,
        url: path,
        startedAt,
        durationMs,
        status: null,
        outcome: "aborted",
      });
      throw error;
    }

    apiBreaker.recordFailure();
    const offline = !navigator.onLine;
    const kind: IncidentKind = timedOut ? "slow" : offline ? "offline" : "network-error";

    recordTrace({
      id: traceId,
      method,
      url: path,
      startedAt,
      durationMs,
      status: null,
      outcome: "network",
      note: timedOut ? "timeout" : offline ? "offline" : "network error",
    });

    if (report) {
      reportIncident({
        kind,
        source: offline ? "connectivity" : "fetch",
        title: timedOut
          ? `${resource} timed out`
          : offline
            ? "You are offline"
            : `${resource} could not be reached`,
        detail: timedOut
          ? `No response after ${(timeoutMs / 1000).toFixed(0)}s, so the request was cancelled.`
          : offline
            ? "The browser reports no network connection. Reads fall back to cache and writes are queued."
            : "The request failed before a response arrived — the browser reports a bare network error.",
        context: { path, method, durationMs, online: navigator.onLine },
        fingerprint: `${kind}:${path}`,
      });
    }

    throw new ApiError(timedOut ? "Request timed out" : "Network request failed", 0, kind, {
      path,
      offline,
    });
  } finally {
    clearTimeout(timeout);
  }
}
