import { z } from "zod";

export const shipmentSchema = z.object({
  id: z.string(),
  reference: z.string(),
  origin: z.string(),
  destination: z.string(),
  carrier: z.string(),
  status: z.enum(["scheduled", "in-transit", "delayed", "delivered", "exception"]),
  eta: z.string(),
  progress: z.number(),
  weightKg: z.number(),
  priority: z.enum(["standard", "expedited", "critical"]),
  updatedAt: z.string(),
});

export const shipmentListSchema = z.object({
  shipments: z.array(shipmentSchema),
  total: z.number(),
});

export const shipmentDetailSchema = z.object({ shipment: shipmentSchema });

export const metricsSchema = z.object({
  inTransit: z.number(),
  delayed: z.number(),
  exceptions: z.number(),
  delivered: z.number(),
  onTimeRate: z.number(),
});

export const lanesSchema = z.object({
  lanes: z.array(z.object({ lane: z.string(), count: z.number(), avgProgress: z.number() })),
});

export const sessionSchema = z.object({
  user: z.object({ id: z.string(), name: z.string(), role: z.string() }),
  issuedAt: z.string(),
  expiresIn: z.number(),
});

export type Shipment = z.infer<typeof shipmentSchema>;
export type Metrics = z.infer<typeof metricsSchema>;
export type Lanes = z.infer<typeof lanesSchema>;
export type Session = z.infer<typeof sessionSchema>;
