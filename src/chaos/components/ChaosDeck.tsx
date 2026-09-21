import { useAtomValue } from "jotai";
import { Ban, Dices } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { allScenarios, armedAtom, armScenario, disarmAllScenarios } from "../registry";
import { CATEGORY_LABEL } from "../scenarios";
import { MetaModes } from "./MetaModes";
import { ScenarioCard } from "./ScenarioCard";

/** The induction panel: what to do to the patient, and how hard. */
export function ChaosDeck() {
  const armed = useAtomValue(armedAtom);
  const scenarios = allScenarios();
  const [busy, setBusy] = useState(false);

  const categories = [...new Set(scenarios.map((scenario) => scenario.category))];

  const surprise = async () => {
    setBusy(true);
    const candidates = scenarios.filter(
      (scenario) => !armed.some((entry) => entry.id === scenario.id),
    );
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    if (pick) await armScenario(pick.id);
    setBusy(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border px-4 py-4">
        <div>
          <h2 className="text-sm font-medium tracking-tight text-foreground">Chaos Deck</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Induce a fault and watch the vitals answer. The Dispatch picks up anything that trips an
            alarm.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={surprise} disabled={busy} className="flex-1">
            <Dices className="size-3.5" aria-hidden />
            Surprise me
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => disarmAllScenarios()}
            disabled={armed.length === 0}
            className="flex-1"
          >
            <Ban className="size-3.5" aria-hidden />
            Stop all{armed.length > 0 ? ` (${armed.length})` : ""}
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <MetaModes />
        {categories.map((category) => (
          <section key={category}>
            <h3 className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground backdrop-blur">
              {CATEGORY_LABEL[category] ?? category}
            </h3>
            {scenarios
              .filter((scenario) => scenario.category === category)
              .map((scenario) => (
                <ScenarioCard key={scenario.id} scenario={scenario} />
              ))}
          </section>
        ))}
      </ScrollArea>
    </div>
  );
}
