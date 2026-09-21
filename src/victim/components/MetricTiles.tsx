import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ApiError } from "@/victim/api/client";
import { useMetrics } from "@/victim/api/queries";

type Tile = {
  key: string;
  label: string;
  value: string;
  tone: string;
  note: string;
};

function buildTiles(metrics: {
  inTransit: number;
  delayed: number;
  exceptions: number;
  delivered: number;
  onTimeRate: number;
}): Tile[] {
  return [
    {
      key: "in-transit",
      label: "In transit",
      value: String(metrics.inTransit),
      tone: "text-foreground",
      note: "moving now",
    },
    {
      key: "delayed",
      label: "Delayed",
      value: String(metrics.delayed),
      tone: metrics.delayed > 0 ? "text-caution" : "text-foreground",
      note: "behind schedule",
    },
    {
      key: "exceptions",
      label: "Exceptions",
      value: String(metrics.exceptions),
      tone: metrics.exceptions > 0 ? "text-crisis" : "text-foreground",
      note: "need a decision",
    },
    {
      key: "on-time",
      label: "On-time rate",
      value: pct(metrics.onTimeRate, 1),
      tone: metrics.onTimeRate >= 0.9 ? "text-healthy" : "text-caution",
      note: `${metrics.delivered} delivered`,
    },
  ];
}

export function MetricTiles() {
  const { data, isPending, isError, error, refetch, isFetching } = useMetrics();

  if (isError) {
    const status = error instanceof ApiError && error.status > 0 ? ` (${error.status})` : "";
    return (
      <section aria-label="Fleet readouts" className="rounded-md border border-border px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          Fleet readouts
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-destructive">
            Readouts unavailable{status}.{" "}
            {error instanceof Error ? error.message : "Unknown error."}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw aria-hidden="true" />
            {isFetching ? "Retrying" : "Retry"}
          </Button>
        </div>
      </section>
    );
  }

  const tiles = data ? buildTiles(data) : null;

  return (
    <section
      aria-label="Fleet readouts"
      aria-busy={isPending}
      className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border lg:grid-cols-4"
    >
      {tiles
        ? tiles.map((tile) => (
            <div key={tile.key} className="bg-background px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                {tile.label}
              </p>
              <p className={cn("mt-1.5 font-mono text-2xl tabular tracking-tight", tile.tone)}>
                {tile.value}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{tile.note}</p>
            </div>
          ))
        : ["a", "b", "c", "d"].map((key) => (
            <div key={key} className="bg-background px-4 py-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2.5 h-7 w-14" />
              <Skeleton className="mt-2 h-3 w-16" />
            </div>
          ))}
    </section>
  );
}
