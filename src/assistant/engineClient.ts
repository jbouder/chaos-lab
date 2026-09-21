import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import { atom } from "jotai";
import { appStore } from "@/store/store";
import { suggestModel } from "./modelCatalog";

export type EngineStatus =
  | { state: "unsupported"; reason: string }
  | { state: "idle" }
  | { state: "downloading"; progress: number; text: string }
  | { state: "ready" }
  | { state: "generating" }
  | { state: "error"; message: string };

export const engineStatusAtom = atom<EngineStatus>({ state: "idle" });
export const modelIdAtom = atom<string>(suggestModel());

let engine: MLCEngineInterface | null = null;
let loading: Promise<MLCEngineInterface> | null = null;
let loadedModelId: string | null = null;

function setStatus(status: EngineStatus): void {
  appStore.set(engineStatusAtom, status);
}

export function engineStatus(): EngineStatus {
  return appStore.get(engineStatusAtom);
}

/**
 * WebGPU is the hard requirement. Everything else in the app works without it,
 * so a failure here downgrades Dispatch to rules-only rather than breaking.
 */
export async function checkSupport(): Promise<{ supported: boolean; reason: string }> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (!gpu) {
    return {
      supported: false,
      reason: "This browser does not expose WebGPU, so the model cannot run locally.",
    };
  }
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return { supported: false, reason: "No WebGPU adapter is available on this device." };
    }
    return { supported: true, reason: "" };
  } catch (error) {
    return {
      supported: false,
      reason: error instanceof Error ? error.message : "WebGPU could not start.",
    };
  }
}

export function currentModelId(): string {
  return appStore.get(modelIdAtom);
}

export async function selectModel(modelId: string): Promise<void> {
  if (modelId === loadedModelId) return;
  appStore.set(modelIdAtom, modelId);
  if (engine) {
    await engine.unload().catch(() => {});
    engine = null;
    loadedModelId = null;
    loading = null;
    setStatus({ state: "idle" });
  }
}

/**
 * Loads the model in a Web Worker so downloading and generating never block
 * the vitals traces. Concurrent callers share one in-flight load.
 */
export async function getEngine(): Promise<MLCEngineInterface> {
  if (engine && loadedModelId === currentModelId()) return engine;
  if (loading) return loading;

  const support = await checkSupport();
  if (!support.supported) {
    setStatus({ state: "unsupported", reason: support.reason });
    throw new Error(support.reason);
  }

  const modelId = currentModelId();
  setStatus({ state: "downloading", progress: 0, text: "Preparing the local model…" });

  loading = (async () => {
    const { CreateWebWorkerMLCEngine } = await import("@mlc-ai/web-llm");
    const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });

    const created = await CreateWebWorkerMLCEngine(worker, modelId, {
      initProgressCallback: (report) => {
        setStatus({ state: "downloading", progress: report.progress, text: report.text });
      },
    });

    engine = created;
    loadedModelId = modelId;
    setStatus({ state: "ready" });
    return created;
  })();

  try {
    return await loading;
  } catch (error) {
    const message = error instanceof Error ? error.message : "The model failed to load.";
    setStatus({ state: "error", message });
    throw error;
  } finally {
    loading = null;
  }
}

export function isEngineReady(): boolean {
  return engine !== null && loadedModelId === currentModelId();
}

export function markGenerating(generating: boolean): void {
  if (engineStatus().state === "unsupported" || engineStatus().state === "error") return;
  setStatus(generating ? { state: "generating" } : { state: "ready" });
}

export async function interruptGeneration(): Promise<void> {
  await engine?.interruptGenerate();
}
