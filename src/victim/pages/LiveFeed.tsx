import { FeedStream } from "@/victim/components/FeedStream";

export function LiveFeed() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Live feed</h1>
        <p className="text-sm text-muted-foreground">
          Carrier scans, departures, customs clearances and exceptions, streamed as they are
          reported. When the connection drops, the console backs off and retries, and you can fall
          back to polling without losing the board.
        </p>
      </header>

      <FeedStream />
    </div>
  );
}
