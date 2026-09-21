import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { uid } from "@/lib/ids";
import { apiFetch } from "./client";
import { enqueue } from "./outbox";
import {
  lanesSchema,
  metricsSchema,
  sessionSchema,
  shipmentDetailSchema,
  shipmentListSchema,
} from "./schemas";

export const queryKeys = {
  shipments: ["shipments"] as const,
  shipment: (id: string) => ["shipments", id] as const,
  metrics: ["metrics"] as const,
  lanes: ["lanes"] as const,
  session: ["session"] as const,
};

export function useShipments() {
  return useQuery({
    queryKey: queryKeys.shipments,
    queryFn: ({ signal }) =>
      apiFetch("/api/shipments", shipmentListSchema, { signal, resource: "Shipments" }),
    refetchInterval: 8_000,
  });
}

export function useShipment(id: string) {
  return useQuery({
    queryKey: queryKeys.shipment(id),
    queryFn: ({ signal }) =>
      apiFetch(`/api/shipments/${id}`, shipmentDetailSchema, { signal, resource: "Shipment" }),
    enabled: Boolean(id),
  });
}

export function useMetrics() {
  return useQuery({
    queryKey: queryKeys.metrics,
    queryFn: ({ signal }) =>
      apiFetch("/api/metrics", metricsSchema, { signal, resource: "Metrics" }),
    refetchInterval: 5_000,
  });
}

export function useLanes() {
  return useQuery({
    queryKey: queryKeys.lanes,
    queryFn: ({ signal }) => apiFetch("/api/lanes", lanesSchema, { signal, resource: "Lanes" }),
    refetchInterval: 8_000,
  });
}

export function useSession() {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: ({ signal }) =>
      apiFetch("/api/session", sessionSchema, { signal, resource: "Session" }),
    retry: false,
  });
}

export type NewShipmentInput = {
  reference: string;
  origin: string;
  destination: string;
  carrier: string;
  weightKg: number;
  priority: "standard" | "expedited" | "critical";
};

export function useCreateShipment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: NewShipmentInput & { idempotencyKey?: string }) => {
      const { idempotencyKey, ...body } = input;

      if (!navigator.onLine) {
        const item = await enqueue({
          path: "/api/shipments",
          method: "POST",
          body,
          label: `Create ${body.reference}`,
        });
        return { queued: true as const, item };
      }

      const result = await apiFetch("/api/shipments", shipmentDetailSchema, {
        method: "POST",
        body,
        idempotencyKey: idempotencyKey ?? uid("idem"),
        resource: "Create shipment",
      });
      return { queued: false as const, shipment: result.shipment };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shipments });
      queryClient.invalidateQueries({ queryKey: queryKeys.metrics });
    },
  });
}
