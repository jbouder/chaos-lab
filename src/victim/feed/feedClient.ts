import { atom } from "jotai";
import { reportIncident, resolveKind } from "@/incidents/bus";
import { backoffDelay } from "@/lib/backoff";
import { uid } from "@/lib/ids";
import { db } from "@/mocks/db";
import { appStore } from "@/store/store";

export type FeedState = "idle" | "connecting" | "open" | "reconnecting" | "polling" | "closed";

export type FeedEvent = {
  id: string;
  at: number;
  reference: string;
  kind: "departed" | "arrived" | "scanned" | "delayed" | "customs" | "exception";
  message: string;
};

const MAX_EVENTS = 60;

export const feedStateAtom = atom<FeedState>("idle");
export const feedEventsAtom = atom<FeedEvent[]>([]);
export const lastEventAtAtom = atom<number | null>(null);
export const feedAttemptAtom = atom(0);
export const feedNextRetryAtom = atom<number | null>(null);

const KINDS: Array<[FeedEvent["kind"], string]> = [
  ["departed", "departed origin terminal"],
  ["arrived", "arrived at transfer hub"],
  ["scanned", "scanned at checkpoint"],
  ["delayed", "held for weather routing"],
  ["customs", "cleared customs"],
  ["exception", "flagged for manual inspection"],
];

/**
 * A stand-in for a realtime connection. It behaves like a socket — states,
 * drops, backoff, a polling fallback — without needing a server, so the chaos
 * layer can sever it precisely.
 */
class FeedClient {
  private tick: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private severed = false;

  connect(): void {
    if (this.state() === "open" || this.state() === "connecting") return;
    this.setState("connecting");
    this.clearTimers();

    this.retry = setTimeout(() => {
      if (this.severed) {
        this.handleDrop("Connection refused while the feed is severed");
        return;
      }
      this.attempt = 0;
      appStore.set(feedAttemptAtom, 0);
      appStore.set(feedNextRetryAtom, null);
      this.setState("open");
      resolveKind("feed-disconnected", "The live feed reconnected.");
      this.startStreaming();
    }, 420);
  }

  private startStreaming(): void {
    this.clearInterval();
    this.tick = setInterval(() => this.emitEvent(), 1600);
    this.emitEvent();
  }

  private emitEvent(): void {
    const records = db.all();
    if (records.length === 0) return;
    const record = records[Math.floor(Math.random() * records.length)];
    const [kind, phrase] = KINDS[Math.floor(Math.random() * KINDS.length)];

    const event: FeedEvent = {
      id: uid("evt"),
      at: Date.now(),
      reference: record.reference,
      kind,
      message: `${record.reference} ${phrase}`,
    };

    appStore.set(feedEventsAtom, [event, ...appStore.get(feedEventsAtom)].slice(0, MAX_EVENTS));
    appStore.set(lastEventAtAtom, event.at);
  }

  /** Chaos entry point: cut the connection and let backoff take over. */
  sever(): void {
    this.severed = true;
    if (this.state() === "idle" || this.state() === "closed") return;
    this.handleDrop("The realtime connection closed unexpectedly (code 1006).");
  }

  restore(): void {
    this.severed = false;
    if (this.state() !== "open" && this.state() !== "polling") this.connect();
  }

  private handleDrop(detail: string): void {
    this.clearInterval();
    this.setState("reconnecting");

    reportIncident({
      kind: "feed-disconnected",
      source: "realtime",
      title: "Live feed disconnected",
      detail,
      context: {
        attempt: this.attempt + 1,
        lastEventAt: appStore.get(lastEventAtAtom),
      },
      fingerprint: "feed-disconnected",
    });

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    this.attempt += 1;
    appStore.set(feedAttemptAtom, this.attempt);
    const delay = backoffDelay(this.attempt, { baseMs: 900, maxMs: 15_000 });
    appStore.set(feedNextRetryAtom, Date.now() + delay);

    if (this.retry) clearTimeout(this.retry);
    this.retry = setTimeout(() => {
      if (this.severed) {
        this.scheduleReconnect();
        return;
      }
      this.connect();
    }, delay);
  }

  /** Manual reconnect, ignoring the current backoff timer. */
  reconnectNow(): boolean {
    if (this.severed) {
      this.attempt = 0;
      this.scheduleReconnect();
      return false;
    }
    this.attempt = 0;
    appStore.set(feedAttemptAtom, 0);
    this.connect();
    return true;
  }

  /** Fall back to a slower transport that survives a broken socket. */
  switchToPolling(): void {
    this.clearTimers();
    this.setState("polling");
    appStore.set(feedNextRetryAtom, null);
    this.tick = setInterval(() => this.emitEvent(), 6000);
    resolveKind("feed-disconnected", "Switched to polling; updates arrive every 6 seconds.");
  }

  disconnect(): void {
    this.clearTimers();
    this.setState("closed");
  }

  state(): FeedState {
    return appStore.get(feedStateAtom);
  }

  private setState(next: FeedState): void {
    appStore.set(feedStateAtom, next);
  }

  private clearInterval(): void {
    if (this.tick) {
      clearInterval(this.tick);
      this.tick = null;
    }
  }

  private clearTimers(): void {
    this.clearInterval();
    if (this.retry) {
      clearTimeout(this.retry);
      this.retry = null;
    }
  }
}

export const feedClient = new FeedClient();
