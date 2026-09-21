import { delay, HttpResponse, http } from "msw";
import { db } from "../db";
import { APP_VERSION, evaluateFaults, type FaultScope, findFault } from "../faults";

type Json = Record<string, unknown> | unknown[];

/**
 * Every handler runs through this gate first: it applies the armed faults
 * (latency, injected statuses, transport errors, throttling) before any real
 * work happens, which is what makes the app misbehave in believable ways.
 */
async function gate(scope: FaultScope): Promise<Response | null> {
  const verdict = evaluateFaults(scope);

  if (verdict.delayMs > 0) await delay(verdict.delayMs);

  if (verdict.networkError) return HttpResponse.error();

  if (verdict.shortCircuit) {
    const { status, headers, message } = verdict.shortCircuit;
    return HttpResponse.json(
      { error: message, status, scenario: verdict.ruleId ?? null },
      { status, headers: { ...headers, "X-App-Version": APP_VERSION, ...verdict.headers } },
    );
  }

  return null;
}

function ok(body: Json, scope: FaultScope): Response {
  const verdict = evaluateFaults(scope);
  return HttpResponse.json(body as never, {
    headers: { "X-App-Version": APP_VERSION, ...verdict.headers },
  });
}

/** Rename a field the client depends on, the way a server-side rename would. */
function drift<T extends Record<string, unknown>>(record: T): Record<string, unknown> {
  const { eta, ...rest } = record;
  return { ...rest, estimatedArrival: eta };
}

export const handlers = [
  http.get("/api/session", async () => {
    const short = await gate("auth");
    if (short) return short;
    const skew = findFault("clockSkew");
    return ok(
      {
        user: { id: "usr_1", name: "Ops Controller", role: "dispatcher" },
        issuedAt: new Date(Date.now() - (skew?.skewMs ?? 0)).toISOString(),
        expiresIn: 1800,
      },
      "auth",
    );
  }),

  http.post("/api/session/refresh", async () => {
    const short = await gate("auth");
    if (short) return short;
    const expired = findFault("authExpired");
    if (expired?.refreshFails) {
      return HttpResponse.json({ error: "Refresh token rejected", status: 401 }, { status: 401 });
    }
    return ok({ refreshed: true, expiresIn: 1800 }, "auth");
  }),

  http.get("/api/shipments", async () => {
    const short = await gate("shipments");
    if (short) return short;
    const verdict = evaluateFaults("shipments");
    const records = db.all();
    return ok(
      {
        shipments: verdict.schemaDrift ? records.map(drift) : records,
        total: records.length,
      },
      "shipments",
    );
  }),

  http.get("/api/shipments/:id", async ({ params }) => {
    const short = await gate("shipment");
    if (short) return short;
    const record = db.find(String(params.id));
    if (!record) {
      return HttpResponse.json({ error: "Shipment not found", status: 404 }, { status: 404 });
    }
    const verdict = evaluateFaults("shipment");
    return ok({ shipment: verdict.schemaDrift ? drift(record) : record }, "shipment");
  }),

  http.post("/api/shipments", async ({ request }) => {
    const short = await gate("mutations");
    if (short) return short;
    const body = (await request.json()) as Partial<Parameters<typeof db.create>[0]>;
    const allowDuplicates = findFault("allowDuplicates");
    const key = allowDuplicates ? undefined : (request.headers.get("Idempotency-Key") ?? undefined);
    const record = db.create(body, key);
    return HttpResponse.json(
      { shipment: record },
      { status: 201, headers: { "X-App-Version": APP_VERSION } },
    );
  }),

  http.delete("/api/shipments/:id", async ({ params }) => {
    const short = await gate("mutations");
    if (short) return short;
    const removed = db.remove(String(params.id));
    return HttpResponse.json({ removed }, { status: removed ? 200 : 404 });
  }),

  http.post("/api/shipments/dedupe", async () => {
    const short = await gate("mutations");
    if (short) return short;
    return ok({ removed: db.dedupe() }, "mutations");
  }),

  http.get("/api/metrics", async () => {
    const short = await gate("metrics");
    if (short) return short;
    const records = db.all();
    const byStatus = records.reduce<Record<string, number>>((acc, record) => {
      acc[record.status] = (acc[record.status] ?? 0) + 1;
      return acc;
    }, {});
    return ok(
      {
        inTransit: byStatus["in-transit"] ?? 0,
        delayed: byStatus.delayed ?? 0,
        exceptions: byStatus.exception ?? 0,
        delivered: byStatus.delivered ?? 0,
        onTimeRate:
          records.length === 0
            ? 1
            : (records.length - (byStatus.delayed ?? 0) - (byStatus.exception ?? 0)) /
              records.length,
      },
      "metrics",
    );
  }),

  http.get("/api/lanes", async () => {
    const short = await gate("lanes");
    if (short) return short;
    const records = db.all();
    const lanes = new Map<string, { lane: string; count: number; avgProgress: number }>();
    for (const record of records) {
      const lane = `${record.origin} → ${record.destination}`;
      const current = lanes.get(lane) ?? { lane, count: 0, avgProgress: 0 };
      current.avgProgress =
        (current.avgProgress * current.count + record.progress) / (current.count + 1);
      current.count += 1;
      lanes.set(lane, current);
    }
    return ok(
      { lanes: [...lanes.values()].sort((a, b) => b.count - a.count).slice(0, 6) },
      "lanes",
    );
  }),

  http.get("/api/health", async () => {
    const short = await gate("all");
    if (short) return short;
    return ok({ status: "ok", version: APP_VERSION, at: new Date().toISOString() }, "all");
  }),
];
