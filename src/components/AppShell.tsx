import { useAtomValue } from "jotai";
import { Activity, FlaskConical, ListOrdered, Radio, Settings, Truck } from "lucide-react";
import { type ReactNode, useState } from "react";
import { NavLink, Outlet } from "react-router";
import { MedicDock } from "@/assistant/components/MedicDock";
import { useAutoEngage } from "@/assistant/useAutoEngage";
import { ChaosDeck } from "@/chaos/components/ChaosDeck";
import { armedAtom } from "@/chaos/registry";
import { ReauthDialog } from "@/components/ReauthDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { VitalsStrip } from "@/components/VitalsStrip";
import { openIncidentsAtom } from "@/incidents/bus";
import { AlarmBar } from "@/incidents/components/AlarmBar";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Overview", icon: Activity, end: true },
  { to: "/shipments", label: "Shipments", icon: Truck, end: false },
  { to: "/feed", label: "Live feed", icon: Radio, end: false },
  { to: "/chart", label: "Chart", icon: ListOrdered, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

export function AppShell() {
  useAutoEngage();
  const armed = useAtomValue(armedAtom);
  const open = useAtomValue(openIncidentsAtom);
  const [deckOpen, setDeckOpen] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              open.length > 0 ? "bg-crisis motion-safe:animate-pulse" : "bg-healthy",
            )}
            aria-hidden
          />
          <p className="text-sm font-medium tracking-tight text-foreground">
            Chaos&nbsp;Lab
            <span className="mx-2 text-muted-foreground opacity-40">/</span>
            <span className="font-normal text-muted-foreground">Meridian Operations</span>
          </p>
        </div>

        <nav className="ml-auto hidden items-center gap-0.5 md:flex" aria-label="Sections">
          {NAV.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 md:ml-2">
          <ThemeToggle />
          <Sheet open={deckOpen} onOpenChange={setDeckOpen}>
            <SheetTrigger asChild>
              <Button
                size="sm"
                variant={armed.length > 0 ? "default" : "outline"}
                className="xl:hidden"
              >
                <FlaskConical className="size-3.5" aria-hidden />
                Chaos{armed.length > 0 ? ` · ${armed.length}` : ""}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-sm">
              <SheetTitle className="sr-only">Chaos Deck</SheetTitle>
              <ChaosDeck />
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <VitalsStrip />
      <AlarmBar />

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-5xl pb-20">
            <Outlet />
          </div>
        </main>

        <aside
          aria-label="Chaos Deck"
          className="hidden w-80 shrink-0 border-l border-border xl:block"
        >
          <div className="sticky top-0 h-dvh">
            <ChaosDeck />
          </div>
        </aside>
      </div>

      <nav
        className="sticky bottom-0 z-30 flex border-t border-border bg-background/95 backdrop-blur md:hidden"
        aria-label="Sections"
      >
        {NAV.map((item) => (
          <NavItem key={item.to} {...item} compact />
        ))}
      </nav>

      <MedicDock />
      <ReauthDialog />
    </div>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  end,
  compact = false,
}: {
  to: string;
  label: string;
  icon: typeof Activity;
  end: boolean;
  compact?: boolean;
}): ReactNode {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-1.5 text-xs transition-colors",
          compact
            ? "flex-1 flex-col gap-1 py-2 text-[10px]"
            : "border-b-2 px-3 py-1.5 -mb-[11px] pb-[11px]",
          isActive
            ? cn("text-foreground", !compact && "border-medic")
            : cn("text-muted-foreground hover:text-foreground", !compact && "border-transparent"),
        )
      }
    >
      <Icon className={compact ? "size-4" : "size-3.5"} aria-hidden />
      {label}
    </NavLink>
  );
}
