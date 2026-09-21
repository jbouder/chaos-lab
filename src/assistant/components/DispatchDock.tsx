import { useAtomValue } from "jotai";
import { Activity, ArrowUp, Eraser, Settings2, Square, Stethoscope, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { deckOpenAtom } from "@/chaos/deck";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { getAction } from "@/incidents/actions";
import { openIncidentsAtom } from "@/incidents/bus";
import { SEVERITY_RANK } from "@/incidents/types";
import { clockTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getCommand } from "../commands";
import { engineStatusAtom, getEngine, modelIdAtom, selectModel } from "../engineClient";
import { MODELS } from "../modelCatalog";
import { executeAction, executeCommand, sendUserMessage, stopGenerating } from "../orchestrator";
import {
  clearConversation,
  closeDock,
  dockOpenAtom,
  messagesAtom,
  openDock,
  settingsAtom,
  unreadAtom,
  updateSettings,
} from "../store";
import { ModelStatus } from "./ModelStatus";

const DUTY_PROMPTS = [
  "Where is MRD-4107?",
  "Which shipments are delayed?",
  "Open the live feed",
  "Switch to light mode",
];

const TRIAGE_PROMPTS = [
  "What just happened?",
  "Why did the retry fail?",
  "Is my data safe?",
  "Walk me through the fix",
];

export function DispatchDock() {
  const open = useAtomValue(dockOpenAtom);
  const unread = useAtomValue(unreadAtom);
  const incidents = useAtomValue(openIncidentsAtom);
  const status = useAtomValue(engineStatusAtom);
  const deckOpen = useAtomValue(deckOpenAtom);

  const alarming = incidents.some(
    (incident) => incident.severity === "critical" || incident.severity === "error",
  );

  return (
    <>
      {open && <DockPanel />}
      <div
        className={cn(
          "pointer-events-none fixed bottom-16 right-4 z-50 flex flex-col items-end gap-3 md:bottom-4",
          deckOpen && "xl:right-[21rem]",
        )}
      >
        {!open && (
          <button
            type="button"
            onClick={() => openDock()}
            aria-label={`Open Dispatch${unread > 0 ? `, ${unread} new messages` : ""}`}
            className={cn(
              "pointer-events-auto relative flex size-13 items-center justify-center rounded-full",
              "border border-border bg-card text-dispatch shadow-lg transition-colors",
              "hover:border-dispatch/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              alarming && "border-crisis/50 text-crisis",
            )}
          >
            <span
              className={cn(
                "absolute inset-0 rounded-full border",
                alarming
                  ? "border-crisis/40 motion-safe:animate-ping"
                  : status.state === "downloading"
                    ? "border-dispatch/30 motion-safe:animate-pulse"
                    : "border-transparent",
              )}
              aria-hidden
            />
            <Stethoscope className="size-5" aria-hidden />
            {unread > 0 && (
              <span className="tabular absolute -right-0.5 -top-0.5 flex size-4.5 items-center justify-center rounded-full bg-dispatch font-mono text-[10px] text-dispatch-foreground">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        )}
      </div>
    </>
  );
}

function DockPanel() {
  const messages = useAtomValue(messagesAtom);
  const settings = useAtomValue(settingsAtom);
  const status = useAtomValue(engineStatusAtom);
  const modelId = useAtomValue(modelIdAtom);
  const deckOpen = useAtomValue(deckOpenAtom);
  const incidents = useAtomValue(openIncidentsAtom);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const generating = status.state === "generating";
  // The register it is working in: routine questions, or the alarm in front of it.
  const alarm = incidents
    .filter((incident) => SEVERITY_RANK[incident.severity] >= SEVERITY_RANK.error)
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0];

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    // Opening Dispatch is consent enough to start the download.
    if (settings.warmOnIdle && status.state === "idle") void getEngine().catch(() => {});
  }, [settings.warmOnIdle, status.state]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDock();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    // Follows the answer as it streams, not just as messages are added.
    const node = listRef.current;
    if (!node || messages.length === 0) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  const submit = async (text: string) => {
    const value = text.trim();
    if (value.length === 0 || generating) return;
    setDraft("");
    await sendUserMessage(value);
  };

  return (
    <aside
      aria-label="The Dispatch"
      className={cn(
        "fixed z-50 flex flex-col border border-border bg-background shadow-2xl",
        "inset-x-0 bottom-0 top-0 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto",
        deckOpen && "xl:right-[21rem]",
        "sm:h-[min(38rem,calc(100vh-6rem))] sm:w-[26rem] sm:rounded-lg",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4",
      )}
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Activity
          className={cn("size-4 shrink-0", alarm ? "text-crisis" : "text-dispatch")}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium tracking-tight text-foreground">
            Dispatch
            <span
              className={cn(
                "ml-2 text-[10px] uppercase tracking-[0.14em]",
                alarm ? "text-crisis" : "text-muted-foreground",
              )}
            >
              {alarm ? "triage" : "on duty"}
            </span>
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {status.state === "unsupported"
              ? "Runbooks only — no WebGPU here"
              : status.state === "downloading"
                ? "Loading the model…"
                : generating
                  ? "Writing…"
                  : alarm
                    ? alarm.title
                    : `${MODELS.find((model) => model.id === modelId)?.label ?? "Local model"} · runs on this device`}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8" aria-label="Dispatch settings">
              <Settings2 className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>How it answers</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={settings.persona === "plain"}
              onCheckedChange={(checked) =>
                updateSettings({ persona: checked ? "plain" : "dispatch" })
              }
            >
              Explain it without the jargon
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={settings.autonomy}
              onCheckedChange={(checked) => updateSettings({ autonomy: checked })}
            >
              Let it run safe fixes itself
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={settings.doNotInterrupt}
              onCheckedChange={(checked) => updateSettings({ doNotInterrupt: checked })}
            >
              Do not open on new alarms
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={settings.warmOnIdle}
              onCheckedChange={(checked) => updateSettings({ warmOnIdle: checked })}
            >
              Load the model when I open this
            </DropdownMenuCheckboxItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Model</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={modelId}
              onValueChange={(value) => void selectModel(value)}
            >
              {MODELS.map((model) => (
                <DropdownMenuRadioItem key={model.id} value={model.id}>
                  {model.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          aria-label="Clear the conversation"
          onClick={clearConversation}
        >
          <Eraser className="size-4" aria-hidden />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          aria-label="Close Dispatch"
          onClick={closeDock}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </header>

      <ModelStatus />

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 px-4 py-4" aria-live="polite">
          {messages.length === 0 ? <EmptyState onPick={submit} /> : null}
          {messages.map((message) => (
            <MessageRow key={message.id} message={message} />
          ))}
        </div>
      </div>

      {messages.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto border-t border-border px-4 py-2">
          {(alarm ? TRIAGE_PROMPTS : DUTY_PROMPTS).map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => submit(prompt)}
              disabled={generating}
              className="shrink-0 border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-dispatch/40 hover:text-foreground disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex items-center gap-2 border-t border-border px-3 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(draft);
        }}
      >
        <Input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            alarm ? "Ask about what just broke…" : "Ask about a shipment, a lane, the board…"
          }
          aria-label="Message Dispatch"
          className="h-9"
        />
        {generating ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-9 shrink-0"
            aria-label="Stop generating"
            onClick={() => void stopGenerating()}
          >
            <Square className="size-3.5" aria-hidden />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            className="size-9 shrink-0"
            aria-label="Send"
            disabled={draft.trim().length === 0}
          >
            <ArrowUp className="size-4" aria-hidden />
          </Button>
        )}
      </form>
    </aside>
  );
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="space-y-4 py-4">
      <p className="text-sm leading-relaxed text-foreground">
        I'm Dispatch. Ask me about the board — where a load is, what a status means, how to book one
        — or tell me to open a page, pull up a shipment, or change the theme.
      </p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        I read the same API the screens do, so if something breaks I'll say so and tell you what to
        do about it.
      </p>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {DUTY_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPick(prompt)}
            className="border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-dispatch/40 hover:text-foreground"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageRow({
  message,
}: {
  message: {
    id: string;
    role: string;
    text: string;
    at: number;
    actions?: string[];
    commands?: string[];
    incidentId?: string;
    streaming?: boolean;
  };
}) {
  if (message.role === "note") {
    return (
      <p className="flex items-baseline gap-2 text-[11px] text-muted-foreground">
        <span className="tabular font-mono">{clockTime(message.at)}</span>
        <span>{message.text}</span>
      </p>
    );
  }

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground">
          {message.text}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="prose-dispatch max-w-none text-sm leading-relaxed text-foreground">
        {message.streaming && message.text.length === 0 ? (
          <span className="text-muted-foreground">Reading the vitals…</span>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
        )}
      </div>

      {((message.actions?.length ?? 0) > 0 || (message.commands?.length ?? 0) > 0) && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {message.actions?.map((id) => {
            const action = getAction(id as Parameters<typeof getAction>[0]);
            if (!action) return null;
            return (
              <Button
                key={id}
                size="sm"
                variant={action.risk === "safe" ? "default" : "outline"}
                onClick={() => void executeAction(action.id, message.incidentId)}
              >
                {action.label}
              </Button>
            );
          })}

          {message.commands?.map((id) => {
            const command = getCommand(id as Parameters<typeof getCommand>[0]);
            if (!command) return null;
            return (
              <Button
                key={id}
                size="sm"
                variant="outline"
                onClick={() => void executeCommand(command.id)}
              >
                {command.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
