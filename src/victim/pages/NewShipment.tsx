import { useAtomValue } from "jotai";
import { CheckCircle2, Inbox } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { duplicateSubmitAtom } from "@/chaos/runtimeState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { reportIncident } from "@/incidents/bus";
import { sinceLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ApiError } from "@/victim/api/client";
import { outboxAtom } from "@/victim/api/outbox";
import { type NewShipmentInput, useCreateShipment } from "@/victim/api/queries";

const CARRIERS = [
  "Northwind Freight",
  "Calder Logistics",
  "Meridian Air",
  "Brightline Rail",
  "Harbour & Co",
];

const PRIORITIES: Array<{ value: NewShipmentInput["priority"]; label: string }> = [
  { value: "standard", label: "Standard" },
  { value: "expedited", label: "Expedited" },
  { value: "critical", label: "Critical" },
];

type FormState = {
  reference: string;
  origin: string;
  destination: string;
  carrier: string;
  weightKg: string;
  priority: NewShipmentInput["priority"];
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

type Outcome =
  | { kind: "created"; reference: string; id: string }
  | { kind: "queued"; reference: string }
  | { kind: "error"; message: string };

function generateReference(): string {
  return `MRD-${Math.floor(Math.random() * 9000) + 1000}`;
}

function blankForm(): FormState {
  return {
    reference: generateReference(),
    origin: "",
    destination: "",
    carrier: "",
    weightKg: "",
    priority: "standard",
  };
}

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.reference.trim()) errors.reference = "A reference is required.";
  else if (!/^[A-Za-z0-9-]{4,}$/.test(form.reference.trim())) {
    errors.reference = "Use letters, digits and dashes — at least four characters.";
  }
  if (!form.origin.trim()) errors.origin = "Enter the origin terminal.";
  if (!form.destination.trim()) errors.destination = "Enter the destination terminal.";
  if (!form.carrier) errors.carrier = "Choose a carrier.";
  const weight = Number(form.weightKg);
  if (!form.weightKg.trim()) errors.weightKg = "Enter a weight in kilograms.";
  else if (!Number.isFinite(weight) || weight <= 0) errors.weightKg = "Weight must be above zero.";
  return errors;
}

export function NewShipment() {
  const ids = {
    reference: useId(),
    origin: useId(),
    destination: useId(),
    carrier: useId(),
    weight: useId(),
    priority: useId(),
  };
  const [form, setForm] = useState<FormState>(blankForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const duplicateSubmit = useAtomValue(duplicateSubmitAtom);
  const outbox = useAtomValue(outboxAtom);
  const create = useCreateShipment();

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setOutcome(null);
      return;
    }

    const input: NewShipmentInput = {
      reference: form.reference.trim(),
      origin: form.origin.trim(),
      destination: form.destination.trim(),
      carrier: form.carrier,
      weightKg: Number(form.weightKg),
      priority: form.priority,
    };

    setOutcome(null);

    try {
      if (duplicateSubmit) {
        // The submit control stays enabled and no idempotency key is reused,
        // so the same consignment is written twice.
        const [first] = await Promise.all([create.mutateAsync(input), create.mutateAsync(input)]);
        reportIncident({
          kind: "duplicate-submit",
          source: "fetch",
          title: "The same shipment was created twice",
          detail:
            "Two identical writes landed because the submit control stayed enabled and no idempotency key was sent.",
          fingerprint: "duplicate-submit",
        });
        if (first.queued) {
          setOutcome({ kind: "queued", reference: input.reference });
        } else {
          setOutcome({
            kind: "created",
            reference: first.shipment.reference,
            id: first.shipment.id,
          });
          toast.success("Shipment created", {
            description: `${first.shipment.reference} is on the board.`,
          });
        }
        setForm(blankForm());
        return;
      }

      const result = await create.mutateAsync(input);
      if (result.queued) {
        setOutcome({ kind: "queued", reference: input.reference });
      } else {
        setOutcome({
          kind: "created",
          reference: result.shipment.reference,
          id: result.shipment.id,
        });
        toast.success("Shipment created", {
          description: `${result.shipment.reference} is on the board.`,
        });
      }
      setForm(blankForm());
    } catch (error) {
      const status = error instanceof ApiError && error.status > 0 ? ` (${error.status})` : "";
      setOutcome({
        kind: "error",
        message: `${error instanceof Error ? error.message : "The write failed."}${status}`,
      });
    }
  };

  const fieldError = (key: keyof FormState) => errors[key];
  const describedBy = (key: keyof FormState) =>
    errors[key] ? `${ids[key === "weightKg" ? "weight" : key]}-error` : undefined;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Book a shipment</h1>
        <p className="text-sm text-muted-foreground">
          Create a consignment on the board. It starts as scheduled until the carrier scans it.
        </p>
      </header>

      {outcome ? (
        <section
          aria-live="polite"
          className={cn(
            "rounded-md border border-border px-4 py-3",
            outcome.kind === "error" && "border-destructive/40",
          )}
        >
          {outcome.kind === "created" ? (
            <div className="flex items-start gap-2">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 text-healthy" />
              <p className="text-sm">
                <span className="font-mono tabular">{outcome.reference}</span> was created.{" "}
                <Link
                  to={`/shipments/${outcome.id}`}
                  className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Open the shipment
                </Link>
                .
              </p>
            </div>
          ) : outcome.kind === "queued" ? (
            <div className="flex items-start gap-2">
              <Inbox aria-hidden="true" className="mt-0.5 size-4 text-caution" />
              <p className="text-sm">
                You are offline, so <span className="font-mono tabular">{outcome.reference}</span>{" "}
                was queued rather than sent. {outbox.length}{" "}
                {outbox.length === 1 ? "write is" : "writes are"} waiting to replay once the
                connection is back.
              </p>
            </div>
          ) : (
            <p className="text-sm text-destructive">{outcome.message}</p>
          )}
        </section>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={ids.reference}>Reference</Label>
            <Input
              id={ids.reference}
              value={form.reference}
              onChange={(event) => update("reference", event.target.value)}
              aria-invalid={Boolean(fieldError("reference"))}
              aria-describedby={describedBy("reference")}
              className="font-mono tabular"
            />
            {fieldError("reference") ? (
              <p id={`${ids.reference}-error`} className="text-xs text-destructive">
                {fieldError("reference")}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Pre-filled from the next free number in the MRD series.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={ids.carrier}>Carrier</Label>
            <Select value={form.carrier} onValueChange={(value) => update("carrier", value)}>
              <SelectTrigger
                id={ids.carrier}
                className="w-full"
                aria-invalid={Boolean(fieldError("carrier"))}
                aria-describedby={describedBy("carrier")}
              >
                <SelectValue placeholder="Select a carrier" />
              </SelectTrigger>
              <SelectContent>
                {CARRIERS.map((carrier) => (
                  <SelectItem key={carrier} value={carrier}>
                    {carrier}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError("carrier") ? (
              <p id={`${ids.carrier}-error`} className="text-xs text-destructive">
                {fieldError("carrier")}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={ids.origin}>Origin</Label>
            <Input
              id={ids.origin}
              value={form.origin}
              onChange={(event) => update("origin", event.target.value)}
              placeholder="Rotterdam, NL"
              aria-invalid={Boolean(fieldError("origin"))}
              aria-describedby={describedBy("origin")}
            />
            {fieldError("origin") ? (
              <p id={`${ids.origin}-error`} className="text-xs text-destructive">
                {fieldError("origin")}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={ids.destination}>Destination</Label>
            <Input
              id={ids.destination}
              value={form.destination}
              onChange={(event) => update("destination", event.target.value)}
              placeholder="Hamburg, DE"
              aria-invalid={Boolean(fieldError("destination"))}
              aria-describedby={describedBy("destination")}
            />
            {fieldError("destination") ? (
              <p id={`${ids.destination}-error`} className="text-xs text-destructive">
                {fieldError("destination")}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={ids.weight}>Weight (kg)</Label>
            <Input
              id={ids.weight}
              type="number"
              inputMode="numeric"
              min={1}
              value={form.weightKg}
              onChange={(event) => update("weightKg", event.target.value)}
              placeholder="1200"
              aria-invalid={Boolean(fieldError("weightKg"))}
              aria-describedby={describedBy("weightKg")}
              className="font-mono tabular"
            />
            {fieldError("weightKg") ? (
              <p id={`${ids.weight}-error`} className="text-xs text-destructive">
                {fieldError("weightKg")}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={ids.priority}>Priority</Label>
            <Select
              value={form.priority}
              onValueChange={(value) => update("priority", value as FormState["priority"])}
            >
              <SelectTrigger id={ids.priority} className="w-full">
                <SelectValue placeholder="Standard" />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-border pt-4">
          <Button type="submit" disabled={create.isPending && !duplicateSubmit}>
            {create.isPending && !duplicateSubmit ? "Creating…" : "Create shipment"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setForm(blankForm());
              setErrors({});
              setOutcome(null);
            }}
          >
            Reset form
          </Button>
        </div>
      </form>

      {outbox.length > 0 ? (
        <section aria-label="Queued writes" className="rounded-md border border-border">
          <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h2 className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              Queued writes
            </h2>
            <span className="font-mono text-xs tabular text-muted-foreground">{outbox.length}</span>
          </header>
          <ul className="divide-y divide-border">
            {outbox.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-3 px-4 py-2">
                <span className="truncate text-sm">{item.label}</span>
                <span className="font-mono text-xs tabular text-muted-foreground">
                  {sinceLabel(item.queuedAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
