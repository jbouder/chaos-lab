import { useAtomValue } from "jotai";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { engineStatusAtom, getEngine, modelIdAtom } from "../engineClient";
import { findModel, formatVram } from "../modelCatalog";

export function ModelStatus() {
  const status = useAtomValue(engineStatusAtom);
  const modelId = useAtomValue(modelIdAtom);
  const model = findModel(modelId);

  if (status.state === "downloading") {
    return (
      <div className="space-y-2 border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Loading {model?.label ?? "the model"}
          </p>
          <span className="tabular font-mono text-[11px] text-muted-foreground">
            {Math.round(status.progress * 100)}%
          </span>
        </div>
        <Progress value={status.progress * 100} className="h-1" />
        <p className="truncate text-[11px] text-muted-foreground">{status.text}</p>
      </div>
    );
  }

  if (status.state === "unsupported") {
    return (
      <div className="border-b border-border bg-caution/10 px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.12em] text-caution">Runbooks only</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {status.reason} Triage, runbooks and every fix still work — only the written answers are
          unavailable.
        </p>
      </div>
    );
  }

  if (status.state === "error") {
    return (
      <div className="border-b border-border bg-crisis/10 px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.12em] text-crisis">Model unavailable</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{status.message}</p>
      </div>
    );
  }

  if (status.state === "idle" && model) {
    return (
      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted-foreground">
          {model.label} runs in this browser. The first answer downloads about{" "}
          {formatVram(model.vramMb)}, then it is cached.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 px-2 text-[11px]"
          onClick={() => void getEngine().catch(() => {})}
        >
          Load now
        </Button>
      </div>
    );
  }

  return null;
}
