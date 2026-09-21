import type { RemediationId } from "@/incidents/types";

const ACTION_PATTERN = /\[\[action:([a-zA-Z]+)\]\]/g;

export type ParsedReply = { text: string; actions: RemediationId[] };

/**
 * Small models drift. The action grammar is deliberately trivial to emit and
 * trivial to strip, so a stray tag never leaks into the rendered answer.
 */
export function parseActions(raw: string, known: Set<string>): ParsedReply {
  const actions: RemediationId[] = [];
  const text = raw.replace(ACTION_PATTERN, (_match, id: string) => {
    if (known.has(id) && !actions.includes(id as RemediationId)) {
      actions.push(id as RemediationId);
    }
    return "";
  });

  return { text: tidy(text), actions };
}

/** Strip reasoning blocks and code fences some models wrap answers in. */
export function tidy(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<\/?think>/g, "")
    .replace(/^\s*```(?:json|markdown)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

/**
 * Find the first balanced JSON object in a string, tolerating the prose and
 * fences a small model may wrap around it.
 */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const source = tidy(raw);
  const start = source.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(start, index + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}
