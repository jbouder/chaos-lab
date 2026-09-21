import { IncidentTimeline } from "@/incidents/components/IncidentTimeline";

export function Chart() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-medium tracking-tight text-foreground">The chart</h1>
        <p className="text-sm text-muted-foreground">
          Every finding, what was tried, and whether it worked.
        </p>
      </header>
      <IncidentTimeline />
    </div>
  );
}
