import { useAtomValue } from "jotai";
import { ArrowRight } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { panelResetAtom } from "@/incidents/actions";
import { ErrorBoundary } from "@/incidents/components/ErrorBoundary";
import { useShipments } from "@/victim/api/queries";
import { LanesPanel } from "@/victim/components/LanesPanel";
import { MetricTiles } from "@/victim/components/MetricTiles";
import { ShipmentsTable } from "@/victim/components/ShipmentsTable";
import { CrashPanel, LoopPanel } from "@/victim/components/UnstablePanels";

export function Overview() {
  const panelReset = useAtomValue(panelResetAtom);
  const navigate = useNavigate();
  const { data, isPending, isError } = useShipments();

  const recent = data ? data.shipments.slice(0, 8) : [];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Operations overview</h1>
        <p className="text-sm text-muted-foreground">
          Live state of the network: what is moving, what is slipping, and what needs a decision.
        </p>
      </header>

      <MetricTiles />

      <div className="grid gap-4 lg:grid-cols-3">
        <LanesPanel />
        <ErrorBoundary key={`crash-${panelReset}`} name="Lane forecast">
          <CrashPanel />
        </ErrorBoundary>
        <ErrorBoundary key={`loop-${panelReset}`} name="Capacity utilisation">
          <LoopPanel />
        </ErrorBoundary>
      </div>

      <section aria-label="Recent shipments" className="rounded-md border border-border">
        <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Recent shipments
          </h2>
          <Link
            to="/shipments"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            All {data ? data.total : ""} shipments
            <ArrowRight aria-hidden="true" className="size-3" />
          </Link>
        </header>

        <div aria-busy={isPending}>
          {isError ? (
            <p className="px-4 py-6 text-sm text-destructive">
              Shipments could not be loaded. The readouts above show the last known figures.
            </p>
          ) : isPending ? (
            <div className="space-y-2 px-4 py-4">
              {["a", "b", "c", "d", "e"].map((key) => (
                <Skeleton key={key} className="h-6 w-full" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              No shipments are on the board yet.
            </p>
          ) : (
            <ShipmentsTable
              shipments={recent}
              onSelect={(id) => void navigate(`/shipments/${id}`)}
            />
          )}
        </div>
      </section>
    </div>
  );
}
