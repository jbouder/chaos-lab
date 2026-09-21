import { atom } from "jotai";
import { appStore } from "@/store/store";
import { armScenario, disarmScenario } from "./registry";

export type ChainStep = {
  /** Wait this long before running the step. */
  afterMs: number;
  scenarioId: string;
  action: "arm" | "disarm";
  note: string;
};

export type Chain = {
  id: string;
  title: string;
  blurb: string;
  steps: ChainStep[];
};

export const runningChainAtom = atom<string | null>(null);
export const chainStepAtom = atom<string | null>(null);

/**
 * Scripted sequences. They exist to test whether the Medic keeps its head
 * across several incidents rather than treating each one as the first.
 */
export const CHAINS: Chain[] = [
  {
    id: "the-commute",
    title: "The commute",
    blurb:
      "Connection drops, comes back, and the session has expired while you were gone. Queued writes have to survive both.",
    steps: [
      { afterMs: 0, scenarioId: "offline", action: "arm", note: "Signal lost" },
      { afterMs: 9000, scenarioId: "offline", action: "disarm", note: "Back on the network" },
      {
        afterMs: 2000,
        scenarioId: "session-expired",
        action: "arm",
        note: "The token expired offline",
      },
      {
        afterMs: 12_000,
        scenarioId: "session-expired",
        action: "disarm",
        note: "Signed in again",
      },
    ],
  },
  {
    id: "the-bad-deploy",
    title: "The bad deploy",
    blurb:
      "A release lands mid-session: the API starts answering a new shape, a chunk goes missing, and the version skews.",
    steps: [
      { afterMs: 0, scenarioId: "version-skew", action: "arm", note: "A newer build is live" },
      {
        afterMs: 5000,
        scenarioId: "schema-drift",
        action: "arm",
        note: "The response shape changed",
      },
      { afterMs: 6000, scenarioId: "chunk-load", action: "arm", note: "An old chunk is gone" },
      { afterMs: 12_000, scenarioId: "schema-drift", action: "disarm", note: "Rolled back" },
      { afterMs: 1000, scenarioId: "version-skew", action: "disarm", note: "Versions agree again" },
    ],
  },
  {
    id: "the-brownout",
    title: "The brownout",
    blurb:
      "The upstream degrades rather than dying: first slow, then flaky, then throttled. The breaker should do the work.",
    steps: [
      { afterMs: 0, scenarioId: "latency", action: "arm", note: "Latency climbing" },
      { afterMs: 8000, scenarioId: "flaky", action: "arm", note: "Errors creeping in" },
      { afterMs: 9000, scenarioId: "rate-limit", action: "arm", note: "Now being throttled" },
      { afterMs: 14_000, scenarioId: "latency", action: "disarm", note: "Recovering" },
      { afterMs: 2000, scenarioId: "flaky", action: "disarm", note: "Errors clearing" },
      { afterMs: 2000, scenarioId: "rate-limit", action: "disarm", note: "Allowance restored" },
    ],
  },
];

let cancelled = false;

export async function runChain(id: string): Promise<void> {
  const chain = CHAINS.find((candidate) => candidate.id === id);
  if (!chain) return;

  cancelled = false;
  appStore.set(runningChainAtom, id);

  for (const step of chain.steps) {
    if (cancelled) break;
    await new Promise((resolve) => setTimeout(resolve, step.afterMs));
    if (cancelled) break;
    appStore.set(chainStepAtom, step.note);
    if (step.action === "arm") await armScenario(step.scenarioId);
    else await disarmScenario(step.scenarioId);
  }

  appStore.set(runningChainAtom, null);
  appStore.set(chainStepAtom, null);
}

export function cancelChain(): void {
  cancelled = true;
}
