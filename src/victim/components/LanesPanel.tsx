import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/victim/api/client";
import { useLanes } from "@/victim/api/queries";

export function LanesPanel() {
  const { data, isPending, isError, error, refetch, isFetching } = useLanes();

  return (
    <section aria-label="Lanes by volume" className="rounded-md border border-border">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          Lanes by volume
        </h2>
        {data ? (
          <span className="font-mono text-xs tabular text-muted-foreground">
            {data.lanes.length} lanes
          </span>
        ) : null}
      </header>

      <div className="px-4 py-3" aria-busy={isPending}>
        {isError ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">
              Lane volumes could not be loaded
              {error instanceof ApiError && error.status > 0 ? ` (${error.status})` : ""}.
            </p>
            <p className="text-sm text-muted-foreground">
              This panel failed on its own — shipments, readouts and the live feed on this page are
              unaffected.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw aria-hidden="true" />
              {isFetching ? "Retrying" : "Retry lanes"}
            </Button>
          </div>
        ) : isPending ? (
          <ul className="space-y-3">
            {["a", "b", "c", "d"].map((key) => (
              <li key={key}>
                <Skeleton className="h-3 w-48" />
                <Skeleton className="mt-2 h-1 w-full" />
              </li>
            ))}
          </ul>
        ) : data.lanes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No lanes are carrying shipments right now.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {data.lanes.map((lane) => (
              <li key={lane.lane} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm">{lane.lane}</span>
                  <span className="font-mono text-xs tabular text-muted-foreground">
                    {lane.count}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div
                    role="progressbar"
                    aria-label={`Average progress on ${lane.lane}`}
                    aria-valuenow={Math.round(lane.avgProgress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${Math.min(100, Math.max(0, lane.avgProgress))}%` }}
                    />
                  </div>
                  <span className="w-10 text-right font-mono text-[11px] tabular text-muted-foreground">
                    {Math.round(lane.avgProgress)}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
