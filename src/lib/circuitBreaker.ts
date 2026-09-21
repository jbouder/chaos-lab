export type BreakerState = "closed" | "open" | "half-open";

export type BreakerSnapshot = {
  state: BreakerState;
  failures: number;
  openedAt: number | null;
  opensUntil: number | null;
};

type Listener = (snapshot: BreakerSnapshot) => void;

/**
 * A textbook circuit breaker, kept deliberately observable so the UI can draw
 * its state and the Medic can explain it: closed → (threshold failures) → open
 * → (cooldown) → half-open → (one probe) → closed or open again.
 */
export class CircuitBreaker {
  private state: BreakerState = "closed";
  private failures = 0;
  private openedAt: number | null = null;
  private listeners = new Set<Listener>();

  constructor(
    private readonly threshold = 4,
    private readonly cooldownMs = 8000,
  ) {}

  snapshot(): BreakerSnapshot {
    this.maybeHalfOpen();
    return {
      state: this.state,
      failures: this.failures,
      openedAt: this.openedAt,
      opensUntil: this.openedAt ? this.openedAt + this.cooldownMs : null,
    };
  }

  canRequest(): boolean {
    this.maybeHalfOpen();
    return this.state !== "open";
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
    this.transition("closed");
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.state === "half-open" || this.failures >= this.threshold) {
      this.openedAt = Date.now();
      this.transition("open");
    } else {
      this.emit();
    }
  }

  /** Force a probe now instead of waiting out the cooldown. */
  probe(): void {
    this.openedAt = null;
    this.transition("half-open");
  }

  reset(): void {
    this.failures = 0;
    this.openedAt = null;
    this.transition("closed");
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private maybeHalfOpen(): void {
    if (this.state === "open" && this.openedAt && Date.now() - this.openedAt >= this.cooldownMs) {
      this.openedAt = null;
      this.transition("half-open");
    }
  }

  private transition(next: BreakerState): void {
    if (this.state === next) {
      this.emit();
      return;
    }
    this.state = next;
    this.emit();
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

export const apiBreaker = new CircuitBreaker();
