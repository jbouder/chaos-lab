import { ArrowLeft, RefreshCw } from "lucide-react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { sinceLabel } from "@/lib/format";
import { ApiError } from "@/victim/api/client";
import { useShipment } from "@/victim/api/queries";
import { PriorityTag, StatusBadge } from "@/victim/components/StatusBadge";

const DT = "text-[11px] uppercase tracking-[0.12em] text-muted-foreground";

function absolute(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleString([], {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function BackLink() {
  return (
    <Link
      to="/shipments"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft aria-hidden="true" className="size-3" />
      All shipments
    </Link>
  );
}

export function ShipmentDetail() {
  const params = useParams();
  const id = params.id ?? "";
  const { data, isPending, isError, error, refetch, isFetching } = useShipment(id);

  if (isError) {
    return (
      <div className="space-y-4">
        <BackLink />
        <section className="space-y-3 rounded-md border border-border px-4 py-4">
          <h1 className="text-sm font-medium tracking-tight text-destructive">
            This shipment could not be loaded
            {error instanceof ApiError && error.status > 0 ? ` (${error.status})` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error
              ? error.message
              : "The request failed before a response arrived."}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw aria-hidden="true" />
            {isFetching ? "Retrying" : "Retry"}
          </Button>
        </section>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy={true}>
        <BackLink />
        <Skeleton className="h-7 w-48" />
        <div className="grid gap-4 rounded-md border border-border px-4 py-4 sm:grid-cols-2">
          {["a", "b", "c", "d", "e", "f"].map((key) => (
            <div key={key} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-36" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const shipment = data.shipment;
  const progress = Math.min(100, Math.max(0, shipment.progress));

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <BackLink />
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="font-mono text-xl tabular tracking-tight">{shipment.reference}</h1>
          <StatusBadge status={shipment.status} />
          <PriorityTag priority={shipment.priority} />
        </header>
        <p className="text-sm text-muted-foreground">
          {shipment.origin} → {shipment.destination}
        </p>
      </div>

      <section aria-label="Shipment details" className="rounded-md border border-border">
        <dl className="grid gap-x-6 gap-y-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className={DT}>Lane</dt>
            <dd className="mt-1 text-sm">
              {shipment.origin} → {shipment.destination}
            </dd>
          </div>
          <div>
            <dt className={DT}>Carrier</dt>
            <dd className="mt-1 text-sm">{shipment.carrier}</dd>
          </div>
          <div>
            <dt className={DT}>Weight</dt>
            <dd className="mt-1 font-mono text-sm tabular">
              {shipment.weightKg.toLocaleString()} kg
            </dd>
          </div>
          <div>
            <dt className={DT}>Estimated arrival</dt>
            <dd className="mt-1 font-mono text-sm tabular">{absolute(shipment.eta)}</dd>
          </div>
          <div>
            <dt className={DT}>Last update</dt>
            <dd className="mt-1 font-mono text-sm tabular">
              {sinceLabel(new Date(shipment.updatedAt).getTime())}
            </dd>
          </div>
          <div>
            <dt className={DT}>Record</dt>
            <dd className="mt-1 font-mono text-sm tabular text-muted-foreground">{shipment.id}</dd>
          </div>
        </dl>

        <div className="border-t border-border px-4 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className={DT}>Progress</p>
            <span className="font-mono text-sm tabular">{Math.round(progress)}%</span>
          </div>
          <div
            role="progressbar"
            aria-label={`Progress for ${shipment.reference}`}
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </section>
    </div>
  );
}
