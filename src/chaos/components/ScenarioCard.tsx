import { useAtomValue } from "jotai";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  armedAtom,
  armScenario,
  defaultKnobs,
  disarmScenario,
  type ScenarioDefinition,
  updateKnobs,
} from "../registry";

export function ScenarioCard({ scenario }: { scenario: ScenarioDefinition }) {
  const armed = useAtomValue(armedAtom).find((entry) => entry.id === scenario.id);
  const [expanded, setExpanded] = useState(false);
  const [knobs, setKnobs] = useState<Record<string, number>>(() => defaultKnobs(scenario));
  const [firing, setFiring] = useState(false);

  const isArmed = Boolean(armed);
  const detailId = `${scenario.id}-detail`;

  const toggle = async (next: boolean) => {
    if (next) await armScenario(scenario.id, knobs);
    else await disarmScenario(scenario.id);
  };

  const fire = async () => {
    setFiring(true);
    await armScenario(scenario.id, knobs);
    setTimeout(() => setFiring(false), 600);
  };

  const setKnob = async (id: string, value: number) => {
    const next = { ...knobs, [id]: value };
    setKnobs(next);
    if (isArmed) await updateKnobs(scenario.id, next);
  };

  return (
    <div
      className={cn(
        "border-b border-border px-4 py-3 transition-colors last:border-b-0",
        isArmed && "bg-crisis/5",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-medium tracking-tight text-foreground">
              {scenario.title}
            </h3>
            {isArmed && (
              <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-crisis">
                armed
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{scenario.symptom}</p>
        </div>

        {scenario.oneShot ? (
          <Button size="sm" variant="outline" className="shrink-0" onClick={fire} disabled={firing}>
            {firing ? "Fired" : "Induce"}
          </Button>
        ) : (
          <Switch
            checked={isArmed}
            onCheckedChange={toggle}
            aria-label={`${isArmed ? "Disarm" : "Arm"} ${scenario.title}`}
            className="mt-0.5 shrink-0"
          />
        )}
      </div>

      {scenario.knobs && scenario.knobs.length > 0 && (
        <div className="mt-3 space-y-3">
          {scenario.knobs.map((knob) => (
            <div key={knob.id} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {knob.label}
              </span>
              <Slider
                value={[knobs[knob.id] ?? knob.defaultValue]}
                min={knob.min}
                max={knob.max}
                step={knob.step}
                aria-label={knob.label}
                onValueChange={([value]) => setKnob(knob.id, value)}
                className="flex-1"
              />
              <span className="tabular w-16 shrink-0 text-right font-mono text-xs text-foreground">
                {knobs[knob.id] ?? knob.defaultValue}
                <span className="text-muted-foreground">{knob.unit}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={detailId}
        className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown
          className={cn("size-3 transition-transform", expanded && "rotate-180")}
          aria-hidden
        />
        Why this matters
      </button>

      {expanded && (
        <p
          id={detailId}
          className="mt-2 border-l border-border pl-3 text-xs leading-relaxed text-muted-foreground"
        >
          {scenario.lesson}
        </p>
      )}
    </div>
  );
}
