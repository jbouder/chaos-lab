/**
 * The router's navigate function, handed out to modules that live outside
 * React — the same trick `victim/api/provoke.ts` uses for the query client.
 * Dispatch needs it to move the app on the user's behalf.
 */
type Navigate = (to: string) => void;

let navigate: Navigate | null = null;

export function attachNavigator(next: Navigate): void {
  navigate = next;
}

export function navigateTo(path: string): boolean {
  if (!navigate) return false;
  navigate(path);
  return true;
}

export function currentPath(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}
