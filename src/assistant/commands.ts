import { closeDeck, deckOpenAtom } from "@/chaos/deck";
import { monkeyAtom, startMonkey, stopMonkey } from "@/chaos/monkey";
import { allScenarios, armedScenarios, armScenario } from "@/chaos/registry";
import { currentPath, navigateTo } from "@/lib/navigation";
import { applyTheme } from "@/providers/ThemeProvider";
import { appStore } from "@/store/store";
import { findShipment } from "./opsData";

export type CommandId =
  | "goOverview"
  | "goShipments"
  | "goNewShipment"
  | "goFeed"
  | "goChart"
  | "goSettings"
  | "openShipment"
  | "themeDark"
  | "themeLight"
  | "themeToggle"
  | "openDeck"
  | "closeDeck"
  | "startMonkey"
  | "stopMonkey"
  | "surpriseMe";

export type CommandResult = { ok: boolean; note: string };

export type Command = {
  id: CommandId;
  label: string;
  /** One line the model reads to decide whether this fits. */
  description: string;
  /** Commands the model may offer on its own. */
  offerable: boolean;
  run: (argument?: string) => Promise<CommandResult> | CommandResult;
};

function go(path: string, name: string): CommandResult {
  if (currentPath() === path) return { ok: true, note: `Already on ${name}.` };
  if (!navigateTo(path)) return { ok: false, note: "The router is not ready yet." };
  return { ok: true, note: `Opened ${name}.` };
}

const COMMANDS: Command[] = [
  {
    id: "goOverview",
    label: "Open Overview",
    description: "Go to the operations overview with the metric tiles and lanes.",
    offerable: true,
    run: () => go("/", "Overview"),
  },
  {
    id: "goShipments",
    label: "Open Shipments",
    description: "Go to the full shipments table.",
    offerable: true,
    run: () => go("/shipments", "Shipments"),
  },
  {
    id: "goNewShipment",
    label: "Start a booking",
    description: "Open the new shipment form.",
    offerable: true,
    run: () => go("/shipments/new", "the booking form"),
  },
  {
    id: "goFeed",
    label: "Open Live feed",
    description: "Go to the live event feed.",
    offerable: true,
    run: () => go("/feed", "Live feed"),
  },
  {
    id: "goChart",
    label: "Open Chart",
    description: "Go to the incident chart — the timeline of what has happened this session.",
    offerable: true,
    run: () => go("/chart", "the Chart"),
  },
  {
    id: "goSettings",
    label: "Open Settings",
    description: "Go to the settings page.",
    offerable: true,
    run: () => go("/settings", "Settings"),
  },
  {
    id: "openShipment",
    label: "Open the shipment",
    description: "Open one shipment's detail page. Needs a reference.",
    offerable: false,
    run: (argument) => {
      const reference = (argument ?? "").trim();
      const shipment = reference ? findShipment(reference) : undefined;
      if (!shipment) {
        return { ok: false, note: `I can't find ${reference || "that reference"} on the board.` };
      }
      return go(`/shipments/${shipment.id}`, shipment.reference);
    },
  },
  {
    id: "themeDark",
    label: "Switch to dark",
    description: "Put the interface into dark mode.",
    offerable: true,
    run: () => {
      applyTheme("dark");
      return { ok: true, note: "Dark mode on." };
    },
  },
  {
    id: "themeLight",
    label: "Switch to light",
    description: "Put the interface into light mode.",
    offerable: true,
    run: () => {
      applyTheme("light");
      return { ok: true, note: "Light mode on." };
    },
  },
  {
    id: "themeToggle",
    label: "Flip the theme",
    description: "Switch between light and dark, whichever is not current.",
    offerable: true,
    run: () => {
      const next = document.documentElement.classList.contains("light") ? "dark" : "light";
      applyTheme(next);
      return { ok: true, note: `${next === "dark" ? "Dark" : "Light"} mode on.` };
    },
  },
  {
    id: "openDeck",
    label: "Open the Chaos Deck",
    description: "Show the panel of faults that can be armed.",
    offerable: true,
    run: () => {
      appStore.set(deckOpenAtom, true);
      return { ok: true, note: "Chaos Deck open." };
    },
  },
  {
    id: "closeDeck",
    label: "Close the Chaos Deck",
    description: "Hide the fault panel.",
    offerable: true,
    run: () => {
      closeDeck();
      return { ok: true, note: "Chaos Deck closed." };
    },
  },
  {
    id: "startMonkey",
    label: "Start the chaos monkey",
    description: "Let the monkey arm and disarm faults on a timer.",
    offerable: true,
    run: () => {
      startMonkey();
      const { cadence } = appStore.get(monkeyAtom);
      return { ok: true, note: `Monkey running — a move every ${cadence}s.` };
    },
  },
  {
    id: "stopMonkey",
    label: "Stop the chaos monkey",
    description: "Stop the timer that arms faults on its own.",
    offerable: true,
    run: () => {
      stopMonkey();
      return { ok: true, note: "Monkey stopped. Armed faults stay armed." };
    },
  },
  {
    id: "surpriseMe",
    label: "Break something",
    description: "Arm one fault at random, without saying which.",
    offerable: true,
    run: async () => {
      const armed = armedScenarios();
      const candidates = allScenarios().filter(
        (scenario) => !armed.some((entry) => entry.id === scenario.id),
      );
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      if (!pick) return { ok: false, note: "Everything is already armed." };
      await armScenario(pick.id);
      return { ok: true, note: "Armed something. You get to work out what." };
    },
  },
];

const BY_ID = new Map(COMMANDS.map((command) => [command.id, command]));

export function getCommand(id: CommandId): Command | undefined {
  return BY_ID.get(id);
}

export function allCommands(): Command[] {
  return COMMANDS;
}

/** The commands the model is allowed to offer, as prompt context. */
export function commandCatalogue(): string {
  return COMMANDS.filter((command) => command.offerable)
    .map((command) => `${command.id}: ${command.description}`)
    .join("\n");
}

export async function runCommand(id: CommandId, argument?: string): Promise<CommandResult> {
  const command = BY_ID.get(id);
  if (!command) return { ok: false, note: `No such command: ${id}` };
  return await command.run(argument);
}
