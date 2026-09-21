import { atom } from "jotai";
import { appStore } from "@/store/store";

export type FaultScope =
  | "all"
  | "shipments"
  | "shipment"
  | "metrics"
  | "lanes"
  | "auth"
  | "mutations";

export type Fault =
  | { kind: "latency"; ms: number; jitter?: number }
  | {
      kind: "status";
      status: number;
      rate?: number;
      headers?: Record<string, string>;
      message?: string;
    }
  | { kind: "networkError"; rate?: number }
  | { kind: "offline" }
  | { kind: "rateLimit"; capacity: number; refillPerSec: number }
  | { kind: "schemaDrift" }
  | { kind: "versionSkew"; version: string }
  | { kind: "authExpired"; refreshFails: boolean }
  | { kind: "clockSkew"; skewMs: number }
  | { kind: "forbidden" }
  | { kind: "allowDuplicates" };

export type FaultRule = {
  /** The scenario that armed this rule. */
  id: string;
  scope: FaultScope;
  fault: Fault;
};

export const faultRulesAtom = atom<FaultRule[]>([]);

export function getFaultRules(): FaultRule[] {
  return appStore.get(faultRulesAtom);
}

export function armFault(rule: FaultRule): void {
  const next = getFaultRules().filter((existing) => existing.id !== rule.id);
  appStore.set(faultRulesAtom, [...next, rule]);
}

export function disarmFault(id: string): void {
  appStore.set(
    faultRulesAtom,
    getFaultRules().filter((rule) => rule.id !== id),
  );
  buckets.delete(id);
}

export function disarmAllFaults(): void {
  appStore.set(faultRulesAtom, []);
  buckets.clear();
}

export function hasFault<K extends Fault["kind"]>(kind: K): boolean {
  return getFaultRules().some((rule) => rule.fault.kind === kind);
}

export function findFault<K extends Fault["kind"]>(
  kind: K,
): (Extract<Fault, { kind: K }> & { ruleId: string }) | undefined {
  for (const rule of getFaultRules()) {
    if (rule.fault.kind === kind) {
      return { ...(rule.fault as Extract<Fault, { kind: K }>), ruleId: rule.id };
    }
  }
  return undefined;
}

function matches(rule: FaultRule, scope: FaultScope): boolean {
  return rule.scope === "all" || rule.scope === scope;
}

/* ---------------------------------------------------------------- buckets */

type Bucket = { tokens: number; lastRefill: number };
const buckets = new Map<string, Bucket>();

function takeToken(ruleId: string, capacity: number, refillPerSec: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(ruleId) ?? { tokens: capacity, lastRefill: now };
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerSec);
  bucket.lastRefill = now;
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    buckets.set(ruleId, bucket);
    return true;
  }
  buckets.set(ruleId, bucket);
  return false;
}

export function bucketState(ruleId: string): { tokens: number; capacity: number } | null {
  const rule = getFaultRules().find((candidate) => candidate.id === ruleId);
  if (rule?.fault.kind !== "rateLimit") return null;
  const bucket = buckets.get(ruleId);
  const capacity = rule.fault.capacity;
  if (!bucket) return { tokens: capacity, capacity };
  const elapsed = (Date.now() - bucket.lastRefill) / 1000;
  return {
    tokens: Math.min(capacity, bucket.tokens + elapsed * rule.fault.refillPerSec),
    capacity,
  };
}

/* ------------------------------------------------------------ evaluation */

export type FaultVerdict = {
  /** Artificial delay to apply before responding. */
  delayMs: number;
  /** A short-circuit response, if the request should never reach the handler. */
  shortCircuit?: { status: number; headers: Record<string, string>; message: string };
  /** Reject at the transport layer, the way a CORS or DNS failure looks. */
  networkError?: boolean;
  /** Headers to merge into a successful response. */
  headers: Record<string, string>;
  /** Mangle the response body to simulate a contract break. */
  schemaDrift: boolean;
  /** The rule responsible, so incidents can point back at a scenario. */
  ruleId?: string;
};

const STATUS_MESSAGE: Record<number, string> = {
  401: "Session expired",
  403: "Insufficient permissions for this operation",
  429: "Rate limit exceeded",
  500: "Internal server error",
  503: "Service temporarily unavailable",
};

export function evaluateFaults(scope: FaultScope): FaultVerdict {
  const verdict: FaultVerdict = { delayMs: 0, headers: {}, schemaDrift: false };

  for (const rule of getFaultRules()) {
    if (!matches(rule, scope)) continue;
    const { fault } = rule;

    switch (fault.kind) {
      case "latency": {
        const jitter = fault.jitter ? Math.random() * fault.jitter : 0;
        verdict.delayMs += fault.ms + jitter;
        break;
      }
      case "offline": {
        verdict.networkError = true;
        verdict.ruleId = rule.id;
        break;
      }
      case "networkError": {
        if (Math.random() < (fault.rate ?? 1)) {
          verdict.networkError = true;
          verdict.ruleId = rule.id;
        }
        break;
      }
      case "status": {
        if (Math.random() < (fault.rate ?? 1) && !verdict.shortCircuit) {
          verdict.shortCircuit = {
            status: fault.status,
            headers: fault.headers ?? {},
            message: fault.message ?? STATUS_MESSAGE[fault.status] ?? "Request failed",
          };
          verdict.ruleId = rule.id;
        }
        break;
      }
      case "rateLimit": {
        if (!takeToken(rule.id, fault.capacity, fault.refillPerSec) && !verdict.shortCircuit) {
          const waitSeconds = Math.max(1, Math.ceil(1 / fault.refillPerSec));
          verdict.shortCircuit = {
            status: 429,
            headers: {
              "Retry-After": String(waitSeconds),
              "X-RateLimit-Limit": String(fault.capacity),
              "X-RateLimit-Remaining": "0",
            },
            message: STATUS_MESSAGE[429],
          };
          verdict.ruleId = rule.id;
        }
        break;
      }
      case "schemaDrift": {
        verdict.schemaDrift = true;
        verdict.ruleId = rule.id;
        break;
      }
      case "versionSkew": {
        verdict.headers["X-App-Version"] = fault.version;
        break;
      }
      case "authExpired": {
        if (!verdict.shortCircuit) {
          verdict.shortCircuit = {
            status: 401,
            headers: { "WWW-Authenticate": 'Bearer error="invalid_token"' },
            message: STATUS_MESSAGE[401],
          };
          verdict.ruleId = rule.id;
        }
        break;
      }
      case "clockSkew": {
        if (!verdict.shortCircuit) {
          verdict.shortCircuit = {
            status: 401,
            headers: { "X-Auth-Reason": "token-not-yet-valid" },
            message: `Token not yet valid — client clock is off by ${Math.round(
              fault.skewMs / 1000,
            )}s`,
          };
          verdict.ruleId = rule.id;
        }
        break;
      }
      case "forbidden": {
        if (!verdict.shortCircuit) {
          verdict.shortCircuit = {
            status: 403,
            headers: {},
            message: STATUS_MESSAGE[403],
          };
          verdict.ruleId = rule.id;
        }
        break;
      }
      case "allowDuplicates":
        break;
    }
  }

  return verdict;
}

export const APP_VERSION = "2026.9.1";
