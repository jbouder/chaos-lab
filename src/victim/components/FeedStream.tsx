import { useAtomValue } from "jotai";
import { Activity, PlugZap } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { clockTime, ms, sinceLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  type FeedState,
  feedAttemptAtom,
  feedClient,
  feedEventsAtom,
  feedNextRetryAtom,
  feedStateAtom,
  lastEventAtAtom,
} from "@/victim/feed/feedClient";

const STATE_META: Record<FeedState, { label: string; tone: string; note: string }> = {
  idle: {
    label: "Idle",
    tone: "text-muted-foreground",
    note: "The stream has not been opened yet.",
  },
  connecting: {
    label: "Connecting",
    tone: "text-caution",
    note: "Opening the realtime connection.",
  },
  open: { label: "Live", tone: "text-healthy", note: "Events arrive as carriers report them." },
  reconnecting: {
    label: "Reconnecting",
    tone: "text-crisis",
    note: "The connection dropped; retries are backing off.",
  },
  polling: {
    label: "Polling",
    tone: "text-caution",
    note: "Degraded transport — updates arrive every 6 seconds.",
  },
  closed: { label: "Closed", tone: "text-crisis", note: "The stream is closed." },
};

const KIND_TONE: Record<string, string> = {
  exception: "text-crisis",
  delayed: "text-caution",
};

export function FeedStream() {
  const state = useAtomValue(feedStateAtom);
  const events = useAtomValue(feedEventsAtom);
  const lastEventAt = useAtomValue(lastEventAtAtom);
  const attempt = useAtomValue(feedAttemptAtom);
  const nextRetry = useAtomValue(feedNextRetryAtom);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const meta = STATE_META[state];
  const retryIn = nextRetry === null ? null : Math.max(0, nextRetry - now);

  return (
    <section aria-label="Live shipment feed" className="rounded-md border border-border">
      <header className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity aria-hidden="true" className={cn("size-4", meta.tone)} />
            <span className={cn("text-sm font-medium tracking-tight", meta.tone)}>
              {meta.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => feedClient.reconnectNow()}>
              <PlugZap aria-hidden="true" />
              Reconnect now
            </Button>
            <Button variant="ghost" size="sm" onClick={() => feedClient.switchToPolling()}>
              Switch to polling
            </Button>
          </div>
        </div>

        <dl aria-live="polite" className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <div>
            <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              Transport
            </dt>
            <dd className="font-mono text-xs tabular">{state}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              Last event
            </dt>
            <dd className="font-mono text-xs tabular">
              {lastEventAt === null ? "—" : sinceLabel(lastEventAt, now)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              Attempt
            </dt>
            <dd className="font-mono text-xs tabular">{attempt === 0 ? "—" : attempt}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              Next retry
            </dt>
            <dd className="font-mono text-xs tabular">{retryIn === null ? "—" : ms(retryIn)}</dd>
          </div>
        </dl>

        <p className="mt-2 text-xs text-muted-foreground">{meta.note}</p>
      </header>

      {events.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">No events yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Scans, departures and customs clearances appear here the moment carriers report them.
          </p>
        </div>
      ) : (
        <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
          {events.map((event) => (
            <li key={event.id} className="flex items-baseline gap-3 px-4 py-2">
              <span className="font-mono text-xs tabular text-muted-foreground">
                {clockTime(event.at)}
              </span>
              <span className="font-mono text-xs tabular">{event.reference}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{event.message}</span>
              <span
                className={cn(
                  "text-[11px] uppercase tracking-[0.12em]",
                  KIND_TONE[event.kind] ?? "text-muted-foreground",
                )}
              >
                {event.kind}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
