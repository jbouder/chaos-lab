import { sinceLabel } from "@/lib/format";
import { getQueryClient } from "@/victim/api/provoke";
import { queryKeys } from "@/victim/api/queries";
import type { Lanes, Metrics, Session, Shipment } from "@/victim/api/schemas";

/**
 * What Dispatch can see of the operations data.
 *
 * It reads the same cache the screens read — never the mock database behind
 * the API. When a fault is armed the assistant goes blind exactly where the UI
 * does, which is the honest answer and the interesting one.
 */
export type Readout<T> =
  | { state: "ok"; data: T; fetchedAt: number }
  | { state: "missing" }
  | { state: "failed"; reason: string };

function read<T>(key: readonly unknown[]): Readout<T> {
  const client = getQueryClient();
  if (!client) return { state: "missing" };

  const state = client.getQueryState<T>(key);
  if (!state) return { state: "missing" };

  if (state.data !== undefined && state.status === "success") {
    return { state: "ok", data: state.data, fetchedAt: state.dataUpdatedAt };
  }

  if (state.error) {
    const reason = state.error instanceof Error ? state.error.message : String(state.error);
    return { state: "failed", reason };
  }

  return { state: "missing" };
}

export function readShipments(): Readout<{ shipments: Shipment[]; total: number }> {
  return read(queryKeys.shipments);
}

export function readMetrics(): Readout<Metrics> {
  return read(queryKeys.metrics);
}

export function readLanes(): Readout<Lanes> {
  return read(queryKeys.lanes);
}

export function readSession(): Readout<Session> {
  return read(queryKeys.session);
}

/* ------------------------------------------------------------- lookups */

export function allShipments(): Shipment[] {
  const readout = readShipments();
  return readout.state === "ok" ? readout.data.shipments : [];
}

/** Matches a reference the way a person types it: loosely, case-blind. */
export function findShipment(reference: string): Shipment | undefined {
  const needle = reference.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (needle.length === 0) return undefined;
  return allShipments().find(
    (shipment) => shipment.reference.replace(/[^a-z0-9]/gi, "").toLowerCase() === needle,
  );
}

export function shipmentsByStatus(status: Shipment["status"]): Shipment[] {
  return allShipments().filter((shipment) => shipment.status === status);
}

export function describeShipment(shipment: Shipment): string {
  const eta = new Date(shipment.eta);
  const late = eta.getTime() < Date.now() && shipment.status !== "delivered";

  return [
    `${shipment.reference} — ${shipment.status}, ${shipment.origin} → ${shipment.destination}`,
    `carrier ${shipment.carrier}, ${shipment.priority} priority, ${shipment.progress}% complete`,
    `ETA ${eta.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}${late ? " (past due)" : ""}`,
    `${shipment.weightKg.toLocaleString()} kg, updated ${sinceLabel(Date.parse(shipment.updatedAt))}`,
  ].join(". ");
}

/* ------------------------------------------------------- prompt context */

function line<T>(label: string, readout: Readout<T>, render: (data: T) => string): string {
  switch (readout.state) {
    case "ok":
      return `${label}: ${render(readout.data)}`;
    case "failed":
      return `${label}: UNAVAILABLE — ${readout.reason}`;
    default:
      return `${label}: not loaded on this screen`;
  }
}

/** The operations picture, compact enough for a small local model. */
export function opsContext(): string {
  const shipments = readShipments();

  const board =
    shipments.state === "ok"
      ? shipments.data.shipments
          .slice(0, 12)
          .map(
            (shipment) =>
              `${shipment.reference} ${shipment.status} ${shipment.origin}→${shipment.destination} ${shipment.progress}% ${shipment.priority}`,
          )
          .join("\n  ")
      : null;

  return [
    "OPERATIONS DATA (what the app itself can currently see)",
    line(
      "metrics",
      readMetrics(),
      (data) =>
        `${data.inTransit} in transit, ${data.delayed} delayed, ${data.exceptions} exceptions, ${data.delivered} delivered, ${(data.onTimeRate * 100).toFixed(1)}% on time`,
    ),
    line("lanes", readLanes(), (data) =>
      data.lanes
        .slice(0, 5)
        .map((lane) => `${lane.lane} (${lane.count})`)
        .join(", "),
    ),
    line("signed in as", readSession(), (data) => `${data.user.name}, role ${data.user.role}`),
    line("shipments", shipments, (data) => `${data.total} total, showing ${data.shipments.length}`),
    board ? `  ${board}` : null,
  ]
    .filter((entry): entry is string => entry !== null)
    .join("\n");
}
