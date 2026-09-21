import type { KeyboardEvent } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Shipment } from "@/victim/api/schemas";
import { PriorityTag, StatusBadge } from "@/victim/components/StatusBadge";

const HEAD = "h-8 text-[11px] font-normal uppercase tracking-[0.12em] text-muted-foreground";

function relativeEta(iso: string, now: number): string {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return "—";
  const delta = at - now;
  const abs = Math.abs(delta);
  const unit =
    abs < 60_000
      ? `${Math.max(1, Math.round(abs / 1000))}s`
      : abs < 3_600_000
        ? `${Math.round(abs / 60_000)}m`
        : abs < 86_400_000
          ? `${Math.round(abs / 3_600_000)}h`
          : `${Math.round(abs / 86_400_000)}d`;
  return delta >= 0 ? `in ${unit}` : `${unit} late`;
}

function absoluteEta(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "No estimate on file";
  return at.toLocaleString([], {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function EtaCell({ eta, now }: { eta: string; now: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="font-mono text-xs tabular underline decoration-border decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {relativeEta(eta, now)}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <span className="font-mono tabular">{absoluteEta(eta)}</span>
      </TooltipContent>
    </Tooltip>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className="h-full bg-primary" style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function ShipmentsTable({
  shipments,
  onSelect,
}: {
  shipments: Shipment[];
  onSelect?: (id: string) => void;
}) {
  const now = Date.now();
  const interactive = Boolean(onSelect);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>, id: string) => {
    if (!onSelect) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect(id);
  };

  const rowLabel = (shipment: Shipment) =>
    `${shipment.reference}, ${shipment.origin} to ${shipment.destination}, ${shipment.status}`;

  return (
    <>
      {/* Mobile: a stacked list, so nothing scrolls sideways at 360px. */}
      <ul className="divide-y divide-border sm:hidden">
        {shipments.map((shipment) => {
          const body = (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-sm tabular">{shipment.reference}</span>
                <StatusBadge status={shipment.status} />
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {shipment.origin} → {shipment.destination}
              </p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="truncate text-xs text-muted-foreground">{shipment.carrier}</span>
                <span className="font-mono text-xs tabular text-muted-foreground">
                  ETA {relativeEta(shipment.eta, now)}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <ProgressBar
                  value={shipment.progress}
                  label={`Progress for ${shipment.reference}`}
                />
                <span className="w-10 text-right font-mono text-[11px] tabular text-muted-foreground">
                  {Math.round(shipment.progress)}%
                </span>
              </div>
            </>
          );

          return (
            <li key={shipment.id}>
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(shipment.id)}
                  aria-label={rowLabel(shipment)}
                  className="w-full px-4 py-3 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {body}
                </button>
              ) : (
                <div className="px-4 py-3">{body}</div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={HEAD}>Reference</TableHead>
              <TableHead className={HEAD}>Lane</TableHead>
              <TableHead className={cn(HEAD, "hidden lg:table-cell")}>Carrier</TableHead>
              <TableHead className={HEAD}>Status</TableHead>
              <TableHead className={cn(HEAD, "hidden lg:table-cell")}>Priority</TableHead>
              <TableHead className={HEAD}>ETA</TableHead>
              <TableHead className={cn(HEAD, "w-32")}>Progress</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shipments.map((shipment) => (
              <TableRow
                key={shipment.id}
                tabIndex={interactive ? 0 : undefined}
                aria-label={interactive ? rowLabel(shipment) : undefined}
                onClick={onSelect ? () => onSelect(shipment.id) : undefined}
                onKeyDown={interactive ? (event) => handleKeyDown(event, shipment.id) : undefined}
                className={cn(
                  interactive &&
                    "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                )}
              >
                <TableCell className="font-mono text-xs tabular">{shipment.reference}</TableCell>
                <TableCell className="max-w-[22ch] truncate text-sm">
                  {shipment.origin} → {shipment.destination}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                  {shipment.carrier}
                </TableCell>
                <TableCell>
                  <StatusBadge status={shipment.status} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <PriorityTag priority={shipment.priority} />
                </TableCell>
                <TableCell>
                  <EtaCell eta={shipment.eta} now={now} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <ProgressBar
                      value={shipment.progress}
                      label={`Progress for ${shipment.reference}`}
                    />
                    <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular text-muted-foreground">
                      {Math.round(shipment.progress)}%
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
