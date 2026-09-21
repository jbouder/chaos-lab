export type BackoffOptions = {
  baseMs?: number;
  maxMs?: number;
  factor?: number;
  /** Full jitter spreads retries so a fleet of clients does not synchronise. */
  jitter?: boolean;
};

export function backoffDelay(attempt: number, options: BackoffOptions = {}): number {
  const { baseMs = 500, maxMs = 30_000, factor = 2, jitter = true } = options;
  const raw = Math.min(maxMs, baseMs * factor ** Math.max(0, attempt));
  return jitter ? Math.random() * raw : raw;
}

export function sleep(delay: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, delay);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/** Parse a `Retry-After` header (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}
