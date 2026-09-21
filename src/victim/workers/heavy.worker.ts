/// <reference lib="webworker" />

self.onmessage = (event: MessageEvent<{ durationMs: number }>) => {
  const { durationMs } = event.data;
  const start = performance.now();
  let checksum = 0;
  while (performance.now() - start < durationMs) {
    checksum += Math.sqrt(Math.random() * 1e9);
  }
  self.postMessage({ durationMs: performance.now() - start, checksum });
};
