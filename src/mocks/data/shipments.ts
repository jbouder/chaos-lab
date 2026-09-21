export type ShipmentStatus = "scheduled" | "in-transit" | "delayed" | "delivered" | "exception";

export type ShipmentRecord = {
  id: string;
  reference: string;
  origin: string;
  destination: string;
  carrier: string;
  status: ShipmentStatus;
  eta: string;
  progress: number;
  weightKg: number;
  priority: "standard" | "expedited" | "critical";
  updatedAt: string;
};

const CARRIERS = [
  "Northwind Freight",
  "Calder Logistics",
  "Meridian Air",
  "Brightline Rail",
  "Harbour & Co",
];

const LANES: Array<[string, string]> = [
  ["Rotterdam, NL", "Hamburg, DE"],
  ["Los Angeles, US", "Osaka, JP"],
  ["Felixstowe, UK", "Dublin, IE"],
  ["Santos, BR", "Algeciras, ES"],
  ["Busan, KR", "Long Beach, US"],
  ["Antwerp, BE", "Gdańsk, PL"],
  ["Singapore, SG", "Colombo, LK"],
  ["Montreal, CA", "Liverpool, UK"],
];

const STATUSES: ShipmentStatus[] = [
  "in-transit",
  "in-transit",
  "scheduled",
  "delayed",
  "delivered",
  "exception",
];

/** Deterministic pseudo-random so the dataset is stable across reloads. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export function buildShipments(count = 28): ShipmentRecord[] {
  const random = seeded(20260920);
  const now = Date.now();

  return Array.from({ length: count }, (_, index) => {
    const lane = LANES[Math.floor(random() * LANES.length)];
    const status = STATUSES[Math.floor(random() * STATUSES.length)];
    const hoursOut = Math.floor(random() * 96) - 12;
    const priorityRoll = random();

    return {
      id: `shp_${(index + 1).toString().padStart(3, "0")}`,
      reference: `MRD-${(4100 + index * 7).toString()}`,
      origin: lane[0],
      destination: lane[1],
      carrier: CARRIERS[Math.floor(random() * CARRIERS.length)],
      status,
      eta: new Date(now + hoursOut * 3_600_000).toISOString(),
      progress:
        status === "delivered" ? 100 : status === "scheduled" ? 0 : Math.floor(random() * 92) + 4,
      weightKg: Math.floor(random() * 24_000) + 800,
      priority: priorityRoll > 0.88 ? "critical" : priorityRoll > 0.62 ? "expedited" : "standard",
      updatedAt: new Date(now - Math.floor(random() * 5_400_000)).toISOString(),
    };
  });
}

export const seedShipments = buildShipments();
