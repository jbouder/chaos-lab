import type { QueryClient } from "@tanstack/react-query";

let client: QueryClient | null = null;

export function attachQueryClient(next: QueryClient): void {
  client = next;
}

export function getQueryClient(): QueryClient | null {
  return client;
}

/**
 * Re-runs whatever the screen is currently showing. Arming a fault only
 * changes what the API *would* do, so without a nudge the app sits on cached
 * data and the failure arrives whenever the next poll happens to land. This
 * makes an armed fault show up on the spot.
 */
export async function provokeTraffic(): Promise<void> {
  await client?.refetchQueries({ type: "active" });
}
