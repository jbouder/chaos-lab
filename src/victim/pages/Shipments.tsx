import { RefreshCw, Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/victim/api/client";
import { useShipments } from "@/victim/api/queries";
import type { Shipment } from "@/victim/api/schemas";
import { ShipmentsTable } from "@/victim/components/ShipmentsTable";

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in-transit", label: "In transit" },
  { value: "delayed", label: "Delayed" },
  { value: "delivered", label: "Delivered" },
  { value: "exception", label: "Exception" },
];

function matches(shipment: Shipment, term: string): boolean {
  if (!term) return true;
  const haystack = [shipment.reference, shipment.origin, shipment.destination, shipment.carrier]
    .join(" ")
    .toLowerCase();
  return haystack.includes(term);
}

export function Shipments() {
  const navigate = useNavigate();
  const searchId = useId();
  const statusId = useId();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const { data, isPending, isError, error, refetch, isFetching } = useShipments();

  const shipments = data?.shipments;

  const filtered = useMemo(() => {
    if (!shipments) return [];
    const term = search.trim().toLowerCase();
    return shipments.filter(
      (shipment) => matches(shipment, term) && (status === "all" || shipment.status === status),
    );
  }, [shipments, search, status]);

  const filtersActive = search.trim().length > 0 || status !== "all";

  const clearFilters = () => {
    setSearch("");
    setStatus("all");
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Shipments</h1>
        <p className="text-sm text-muted-foreground">
          Every consignment on the board, newest movement first.
        </p>
      </header>

      <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label
            htmlFor={searchId}
            className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground"
          >
            Search
          </Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={searchId}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Reference, origin, destination or carrier"
              className="pl-9"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor={statusId}
            className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground"
          >
            Status
          </Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id={statusId} className="w-full sm:w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p aria-live="polite" className="font-mono text-xs tabular text-muted-foreground sm:pb-2.5">
          {data ? `${filtered.length} of ${data.total}` : "—"}
        </p>
      </div>

      {isError ? (
        <section className="space-y-3 rounded-md border border-border px-4 py-4">
          <h2 className="text-sm font-medium tracking-tight text-destructive">
            Shipments could not be loaded
            {error instanceof ApiError && error.status > 0 ? ` (${error.status})` : ""}
          </h2>
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
      ) : isPending ? (
        <div className="space-y-2 rounded-md border border-border px-4 py-4" aria-busy={true}>
          {["a", "b", "c", "d", "e", "f", "g", "h"].map((key) => (
            <Skeleton key={key} className="h-7 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <section className="rounded-md border border-border px-4 py-12 text-center">
          <p className="text-sm">No shipments match these filters.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.total} shipments are on the board; none of them match the current search and
            status.
          </p>
          {filtersActive ? (
            <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </section>
      ) : (
        <section aria-label="Shipment list" className="rounded-md border border-border">
          <ShipmentsTable
            shipments={filtered}
            onSelect={(id) => void navigate(`/shipments/${id}`)}
          />
        </section>
      )}
    </div>
  );
}
