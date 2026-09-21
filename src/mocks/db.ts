import { buildShipments, type ShipmentRecord } from "./data/shipments";

/** In-memory store standing in for a database, reset per page load. */
class ShipmentDb {
  private records: ShipmentRecord[] = buildShipments();
  private idempotency = new Map<string, string>();

  all(): ShipmentRecord[] {
    return this.records;
  }

  find(id: string): ShipmentRecord | undefined {
    return this.records.find((record) => record.id === id);
  }

  create(input: Partial<ShipmentRecord>, idempotencyKey?: string): ShipmentRecord {
    if (idempotencyKey) {
      const existingId = this.idempotency.get(idempotencyKey);
      const existing = existingId ? this.find(existingId) : undefined;
      if (existing) return existing;
    }

    const record: ShipmentRecord = {
      id: `shp_${Math.random().toString(36).slice(2, 8)}`,
      reference: input.reference ?? `MRD-${Math.floor(Math.random() * 9000) + 1000}`,
      origin: input.origin ?? "Unknown",
      destination: input.destination ?? "Unknown",
      carrier: input.carrier ?? "Northwind Freight",
      status: "scheduled",
      eta: input.eta ?? new Date(Date.now() + 48 * 3_600_000).toISOString(),
      progress: 0,
      weightKg: input.weightKg ?? 1000,
      priority: input.priority ?? "standard",
      updatedAt: new Date().toISOString(),
    };

    this.records = [record, ...this.records];
    if (idempotencyKey) this.idempotency.set(idempotencyKey, record.id);
    return record;
  }

  remove(id: string): boolean {
    const before = this.records.length;
    this.records = this.records.filter((record) => record.id !== id);
    return this.records.length !== before;
  }

  /** Collapse records that share a reference, keeping the oldest. */
  dedupe(): number {
    const seen = new Set<string>();
    const kept: ShipmentRecord[] = [];
    for (const record of [...this.records].reverse()) {
      if (seen.has(record.reference)) continue;
      seen.add(record.reference);
      kept.push(record);
    }
    const removed = this.records.length - kept.length;
    this.records = kept.reverse();
    return removed;
  }

  duplicateReferences(): string[] {
    const counts = new Map<string, number>();
    for (const record of this.records) {
      counts.set(record.reference, (counts.get(record.reference) ?? 0) + 1);
    }
    return [...counts.entries()].filter(([, count]) => count > 1).map(([reference]) => reference);
  }
}

export const db = new ShipmentDb();
