import { cn } from "@/lib/utils";
import type { Shipment } from "@/victim/api/schemas";

const STATUS_LABEL: Record<Shipment["status"], string> = {
  scheduled: "Scheduled",
  "in-transit": "In transit",
  delayed: "Delayed",
  delivered: "Delivered",
  exception: "Exception",
};

/** Colour is reserved for status, and only ever as tinted text plus a dot. */
const STATUS_TONE: Record<Shipment["status"], string> = {
  scheduled: "text-muted-foreground",
  "in-transit": "text-healthy",
  delayed: "text-caution",
  delivered: "text-healthy",
  exception: "text-crisis",
};

export function StatusBadge({ status }: { status: Shipment["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs whitespace-nowrap",
        STATUS_TONE[status],
      )}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

const PRIORITY_LABEL: Record<Shipment["priority"], string> = {
  standard: "Standard",
  expedited: "Expedited",
  critical: "Critical",
};

const PRIORITY_TONE: Record<Shipment["priority"], string> = {
  standard: "text-muted-foreground",
  expedited: "text-foreground",
  critical: "text-caution",
};

export function PriorityTag({ priority }: { priority: Shipment["priority"] }) {
  return (
    <span
      className={cn(
        "text-[11px] uppercase tracking-[0.12em] whitespace-nowrap",
        PRIORITY_TONE[priority],
      )}
    >
      {PRIORITY_LABEL[priority]}
    </span>
  );
}
