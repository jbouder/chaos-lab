import { useAtomValue } from "jotai";
import { ClipboardCopy, RefreshCw, RotateCcw } from "lucide-react";
import { useState } from "react";
import { leakedMb, leakingAtom, readSavedSettings, resetSavedSettings } from "@/chaos/runtimeState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/victim/api/client";
import { useSession } from "@/victim/api/queries";

const SETTINGS_KEY = "chaos-lab:settings";
const DT = "text-[11px] uppercase tracking-[0.12em] text-muted-foreground";

type StoredState =
  | { ok: true; value: Record<string, unknown> | null }
  | { ok: false; message: string };

function loadStored(): StoredState {
  try {
    return { ok: true, value: readSavedSettings() };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The stored value could not be parsed.",
    };
  }
}

function sessionCopy(error: unknown): { title: string; detail: string } {
  if (error instanceof ApiError && error.status === 401) {
    return {
      title: "Your session has expired",
      detail: "The server rejected the session token. Sign in again to keep working.",
    };
  }
  if (error instanceof ApiError && error.status === 403) {
    return {
      title: "This account cannot read session details",
      detail:
        "You are signed in, but the dispatcher role is not permitted to read the session record. Ask an administrator to widen the role.",
    };
  }
  return {
    title: "Session details are unavailable",
    detail:
      error instanceof Error ? error.message : "The request failed before a response arrived.",
  };
}

export function Settings() {
  const { data, isPending, isError, error, refetch, isFetching } = useSession();
  const [stored, setStored] = useState<StoredState>(loadStored);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const leaking = useAtomValue(leakingAtom);
  const leaked = useAtomValue(leakedMb);

  const copyStored = async () => {
    try {
      await navigator.clipboard.writeText(localStorage.getItem(SETTINGS_KEY) ?? "");
      setCopyNote("Copied the stored value to the clipboard.");
    } catch {
      setCopyNote("The browser blocked clipboard access.");
    }
  };

  const resetStored = () => {
    resetSavedSettings();
    setStored(loadStored());
    setCopyNote(null);
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Who you are signed in as, and what this console has stored on this device.
        </p>
      </header>

      <section aria-label="Session" className="rounded-md border border-border">
        <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 className={DT}>Session</h2>
          <Button variant="ghost" size="xs" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw aria-hidden="true" />
            {isFetching ? "Checking" : "Refresh"}
          </Button>
        </header>

        <div className="px-4 py-4" aria-busy={isPending}>
          {isError ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">
                {sessionCopy(error).title}
                {error instanceof ApiError && error.status > 0 ? ` (${error.status})` : ""}
              </p>
              <p className="text-sm text-muted-foreground">{sessionCopy(error).detail}</p>
            </div>
          ) : isPending ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {["a", "b", "c", "d"].map((key) => (
                <div key={key} className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </div>
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className={DT}>Signed in as</dt>
                <dd className="mt-1 text-sm">{data.user.name}</dd>
              </div>
              <div>
                <dt className={DT}>Role</dt>
                <dd className="mt-1 text-sm">{data.user.role}</dd>
              </div>
              <div>
                <dt className={DT}>Issued at</dt>
                <dd className="mt-1 font-mono text-sm tabular">
                  {new Date(data.issuedAt).toLocaleString([], { hour12: false })}
                </dd>
              </div>
              <div>
                <dt className={DT}>Expires in</dt>
                <dd className="mt-1 font-mono text-sm tabular">
                  {Math.round(data.expiresIn / 60)}m
                </dd>
              </div>
            </dl>
          )}
        </div>
      </section>

      <section aria-label="Stored preferences" className="rounded-md border border-border">
        <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 className={DT}>Stored preferences</h2>
          <span className="font-mono text-[11px] tabular text-muted-foreground">
            {SETTINGS_KEY}
          </span>
        </header>

        <div className="space-y-3 px-4 py-4">
          {stored.ok ? (
            stored.value === null ? (
              <p className="text-sm text-muted-foreground">
                Nothing is stored on this device yet — the console is using its defaults.
              </p>
            ) : (
              <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs tabular">
                {JSON.stringify(stored.value, null, 2)}
              </pre>
            )
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-destructive">
                The stored preferences are malformed and could not be read.
              </p>
              <p className="text-sm text-muted-foreground">
                {stored.message} Copy the raw value first if you want to keep it, then reset to
                defaults — nothing on the server is affected.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => void copyStored()}>
                  <ClipboardCopy aria-hidden="true" />
                  Copy stored value
                </Button>
                <Button variant="outline" size="sm" onClick={resetStored}>
                  <RotateCcw aria-hidden="true" />
                  Reset to defaults
                </Button>
              </div>
              {copyNote ? (
                <p aria-live="polite" className="text-xs text-muted-foreground">
                  {copyNote}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </section>

      {leaking ? (
        <section aria-label="Background allocations" className="rounded-md border border-border">
          <header className="border-b border-border px-4 py-2.5">
            <h2 className={DT}>Background allocations</h2>
          </header>
          <div className="flex items-baseline justify-between gap-3 px-4 py-4" aria-live="polite">
            <p className="text-sm text-muted-foreground">
              Timers left running by this console are still allocating memory.
            </p>
            <p className="font-mono text-xl tabular text-caution">{leaked}MB</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
