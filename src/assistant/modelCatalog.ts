export type ModelTier = "compact" | "balanced" | "capable";

export type ModelEntry = {
  id: string;
  label: string;
  tier: ModelTier;
  /** Approximate GPU memory the weights need once resident. */
  vramMb: number;
  blurb: string;
};

export const MODELS: ModelEntry[] = [
  {
    id: "Qwen3-0.6B-q4f16_1-MLC",
    label: "Qwen3 0.6B",
    tier: "compact",
    vramMb: 1403,
    blurb: "Smallest download. Good for short triage lines on phones and light laptops.",
  },
  {
    id: "Qwen3-1.7B-q4f16_1-MLC",
    label: "Qwen3 1.7B",
    tier: "balanced",
    vramMb: 2037,
    blurb: "The default. Follows the action format reliably and still loads quickly.",
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 3B",
    tier: "capable",
    vramMb: 2264,
    blurb: "Warmer prose for walkthroughs, at a noticeably larger download.",
  },
  {
    id: "Qwen3-4B-q4f16_1-MLC",
    label: "Qwen3 4B",
    tier: "capable",
    vramMb: 3432,
    blurb: "The most careful reasoning here. Only worth it on a desktop GPU.",
  },
];

export const DEFAULT_DESKTOP_MODEL = "Qwen3-1.7B-q4f16_1-MLC";
export const DEFAULT_MOBILE_MODEL = "Qwen3-0.6B-q4f16_1-MLC";

export function findModel(id: string): ModelEntry | undefined {
  return MODELS.find((model) => model.id === id);
}

export function formatVram(vramMb: number): string {
  return `${(vramMb / 1024).toFixed(1)} GB`;
}

/** Pick a default from the device rather than making the user choose first. */
export function suggestModel(): string {
  const mobile = window.matchMedia("(max-width: 768px)").matches;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (mobile || (memory !== undefined && memory <= 4)) return DEFAULT_MOBILE_MODEL;
  return DEFAULT_DESKTOP_MODEL;
}
