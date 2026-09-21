import { useAtomValue } from "jotai";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { CHAINS, cancelChain, chainStepAtom, runChain, runningChainAtom } from "../chains";
import { configureMonkey, monkeyAtom, startMonkey, stopMonkey } from "../monkey";

/** Two ways to stop choosing faults by hand: at random, or to a script. */
export function MetaModes() {
  const monkey = useAtomValue(monkeyAtom);
  const runningChain = useAtomValue(runningChainAtom);
  const chainStep = useAtomValue(chainStepAtom);

  return (
    <div className="space-y-4 border-b border-border px-4 py-4">
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium tracking-tight text-foreground">Chaos monkey</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Arms and disarms faults on its own, so nothing is announced.
            </p>
          </div>
          <Switch
            checked={monkey.running}
            onCheckedChange={(next) => (next ? startMonkey() : stopMonkey())}
            aria-label={monkey.running ? "Stop the chaos monkey" : "Start the chaos monkey"}
            className="mt-0.5 shrink-0"
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Every
          </span>
          <Slider
            value={[monkey.cadence]}
            min={2}
            max={60}
            step={1}
            aria-label="Seconds between moves"
            onValueChange={([value]) => configureMonkey({ cadence: value })}
            className="flex-1"
          />
          <span className="tabular w-16 shrink-0 text-right font-mono text-xs text-foreground">
            {monkey.cadence}
            <span className="text-muted-foreground">s</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Blast radius
          </span>
          <Slider
            value={[monkey.blastRadius]}
            min={1}
            max={5}
            step={1}
            aria-label="Faults armed at once"
            onValueChange={([value]) => configureMonkey({ blastRadius: value })}
            className="flex-1"
          />
          <span className="tabular w-16 shrink-0 text-right font-mono text-xs text-foreground">
            {monkey.blastRadius}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Scripts</p>
        {CHAINS.map((chain) => {
          const active = runningChain === chain.id;
          return (
            <div key={chain.id} className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground">{chain.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {active && chainStep ? chainStep : chain.blurb}
                </p>
              </div>
              <Button
                size="sm"
                variant={active ? "default" : "outline"}
                className="h-7 shrink-0 px-2 text-xs"
                onClick={() => (active ? cancelChain() : void runChain(chain.id))}
                disabled={runningChain !== null && !active}
              >
                {active ? (
                  <>
                    <Square className="size-3" aria-hidden />
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="size-3" aria-hidden />
                    Run
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
