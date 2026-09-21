import { useAtom, useAtomValue } from "jotai";
import { useState } from "react";
import { disarmScenario } from "@/chaos/registry";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { draftSavedAtom, reauthOpenAtom } from "@/incidents/actions";
import { resolveKind } from "@/incidents/bus";
import { sinceLabel } from "@/lib/format";

/**
 * Re-authentication that does not cost the user their work: the draft is
 * already saved by the time this opens, and signing in restores it.
 */
export function ReauthDialog() {
  const [open, setOpen] = useAtom(reauthOpenAtom);
  const draftSavedAt = useAtomValue(draftSavedAtom);
  const [signing, setSigning] = useState(false);

  const signIn = async () => {
    setSigning(true);
    await disarmScenario("session-expired");
    await disarmScenario("clock-skew");
    resolveKind("session-expired", "Signed in again; the draft was restored.");
    setSigning(false);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Your session timed out</DialogTitle>
          <DialogDescription>
            Sign in again to keep going. Nothing you were working on has been lost.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="reauth-email">Email</Label>
            <Input id="reauth-email" type="email" defaultValue="controller@meridian.example" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reauth-password">Password</Label>
            <Input id="reauth-password" type="password" defaultValue="hunter2hunter2" />
          </div>
          {draftSavedAt && (
            <p className="text-xs text-muted-foreground">
              Draft saved {sinceLabel(new Date(draftSavedAt).getTime())} and ready to restore.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Not now
          </Button>
          <Button onClick={signIn} disabled={signing}>
            {signing ? "Signing in…" : "Sign in"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
