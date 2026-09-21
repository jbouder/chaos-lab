import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export function NotFound() {
  return (
    <div className="space-y-4 py-12">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">404</p>
      <h1 className="text-xl font-medium tracking-tight text-foreground">No such page</h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        That route does not exist. This one is a genuine 404, not one of the injected faults.
      </p>
      <Button asChild variant="outline">
        <Link to="/">Back to the overview</Link>
      </Button>
    </div>
  );
}
