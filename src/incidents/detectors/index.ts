import { engineStatus } from "@/assistant/engineClient";
import { reportIncident, resolveKind } from "../bus";

type Cleanup = () => void;

/** Heap size, when the browser exposes it (Chromium only). */
type MemoryInfo = { usedJSHeapSize: number; jsHeapSizeLimit: number };

function heap(): MemoryInfo | null {
  const candidate = (performance as Performance & { memory?: MemoryInfo }).memory;
  return candidate ?? null;
}

export function currentHeapMb(): number | null {
  const memory = heap();
  return memory ? memory.usedJSHeapSize / 1024 / 1024 : null;
}

function windowErrors(): Cleanup {
  const onError = (event: ErrorEvent) => {
    const message = event.message ?? "Uncaught error";
    const isChunk =
      /dynamically imported module|Importing a module script failed|Loading chunk/i.test(message);

    reportIncident({
      kind: isChunk ? "chunk-load" : "unknown",
      source: "window",
      title: isChunk ? "Part of the app failed to load" : "Uncaught error",
      detail: message,
      context: { filename: event.filename, line: event.lineno, column: event.colno },
      fingerprint: `window:${message.slice(0, 80)}`,
    });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Promise rejected";

    reportIncident({
      kind: "unhandled-rejection",
      source: "window",
      title: "A background task failed silently",
      detail: message,
      context: { stack: reason instanceof Error ? reason.stack?.slice(0, 400) : undefined },
      fingerprint: `rejection:${message.slice(0, 80)}`,
    });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

function connectivity(): Cleanup {
  const onOffline = () => {
    reportIncident({
      kind: "offline",
      source: "connectivity",
      title: "The device went offline",
      detail: "The browser reports no network connection. Writes will be queued until it returns.",
      context: { online: false },
      fingerprint: "offline",
    });
  };

  const onOnline = () => {
    resolveKind("offline", "The connection came back.");
    resolveKind("network-error", "The connection came back.");
  };

  window.addEventListener("offline", onOffline);
  window.addEventListener("online", onOnline);
  return () => {
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("online", onOnline);
  };
}

function longTasks(): Cleanup {
  if (typeof PerformanceObserver === "undefined") return () => {};
  if (!PerformanceObserver.supportedEntryTypes?.includes("longtask")) return () => {};

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration < 250) continue;
      reportIncident({
        kind: "main-thread-freeze",
        source: "perf",
        severity: entry.duration > 1500 ? "error" : "warning",
        title: "The interface stopped responding",
        detail: `A single task blocked the main thread for ${(entry.duration / 1000).toFixed(1)}s.`,
        context: { durationMs: Math.round(entry.duration) },
        fingerprint: "long-task",
      });
    }
  });

  observer.observe({ entryTypes: ["longtask"] });
  return () => observer.disconnect();
}

function memoryGrowth(): Cleanup {
  if (!heap()) return () => {};
  const samples: Array<{ at: number; mb: number }> = [];

  const timer = setInterval(() => {
    // Loading model weights allocates hundreds of megabytes on purpose; that
    // is not the leak this detector is looking for.
    const engine = engineStatus().state;
    if (engine === "downloading" || engine === "generating") {
      samples.length = 0;
      return;
    }

    const mb = currentHeapMb();
    if (mb == null) return;
    const now = Date.now();
    samples.push({ at: now, mb });
    while (samples.length > 0 && now - samples[0].at > 45_000) samples.shift();
    if (samples.length < 6) return;

    const first = samples[0];
    const last = samples[samples.length - 1];
    const minutes = (last.at - first.at) / 60_000;
    if (minutes <= 0) return;
    const growth = (last.mb - first.mb) / minutes;

    if (growth > 30 && last.mb > 120) {
      reportIncident({
        kind: "memory-leak",
        source: "perf",
        severity: "warning",
        title: "Memory use keeps climbing",
        detail: `The heap grew by about ${growth.toFixed(0)}MB per minute over the last ${Math.round(
          minutes * 60,
        )}s.`,
        context: { growthMbPerMin: Number(growth.toFixed(1)), heapMb: Number(last.mb.toFixed(1)) },
        fingerprint: "memory-leak",
      });
    }
  }, 5000);

  return () => clearInterval(timer);
}

let installed = false;

export function installDetectors(): Cleanup {
  if (installed) return () => {};
  installed = true;
  const cleanups = [windowErrors(), connectivity(), longTasks(), memoryGrowth()];
  return () => {
    for (const cleanup of cleanups) cleanup();
    installed = false;
  };
}
