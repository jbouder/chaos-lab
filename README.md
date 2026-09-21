# Chaos Lab

A playground for breaking a web app on purpose, and an on-device assistant that notices, explains
and helps fix it.

The app you break is **Meridian**, a small freight-operations console. It is backed by Mock Service
Worker, so there is no server: every fault is injected in the browser. The assistant, **Dispatch**,
runs a language model locally with WebGPU via [WebLLM](https://github.com/mlc-ai/web-llm). Nothing
about an incident leaves the machine.

The interface borrows its structure from a bedside patient monitor. Vitals across the top, alarms
underneath, a chart of what happened and what was tried, and a Chaos Deck for inducing symptoms.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

Requires a browser with WebGPU (Chrome or Edge 113+, Safari 18+) for the model. Without it the app
still works: triage, runbooks and every fix are deterministic, and Dispatch says plainly that it is
running on runbooks alone.

```bash
npm run build    # typecheck + production build
npm run check    # Biome: format, lint, organise imports
```

## How a scenario plays out

1. Arm something in the Chaos Deck, for example **Hard outage**.
2. The vitals react first. Success rate drops, the trace flatlines, the alarm bar turns red.
3. A detector raises an incident. The Dispatch opens with a triage card built from the runbook,
   before the model has said anything.
4. The model adds a one-line reading and recommends one action.
5. Run the action. Its outcome is recorded against the incident, and the chart shows whether it
   worked.

## What can go wrong

| Scenario | What you see | What it teaches |
|---|---|---|
| Hard outage | Every call returns 503 with `Retry-After` | Backoff with jitter, and honouring the header |
| Flaky upstream | A share of calls fail | Circuit breaker: closed, open, half-open |
| Latency spike | Slow responses, no errors | Timeouts, cancellation, honest waiting copy |
| Connection lost | Offline; writes queue | An outbox that replays on reconnect |
| Rate limited | 429 after a burst | Token buckets refill; retrying harder does not help |
| Blocked at the transport | `Failed to fetch`, no status | What CORS and DNS failures look like from JS |
| Schema drift | `eta` becomes `estimatedArrival` | Validate at the boundary to get the real field name |
| One panel down | A single widget fails | Scope failure to the thing that failed |
| Deploy mid-session | A lazy chunk 404s | One guarded reload, never a reload loop |
| Version skew | Server reports a newer build | Detect it, say so, reload when work is safe |
| Double submit | Two identical records | Idempotency keys, not just a disabled button |
| Session expiry | 401, refresh fails | Save the draft before asking anyone to sign in |
| Device clock wrong | Token "not yet valid" | Some fixes live in OS settings, not the app |
| Permission revoked | 403 with a valid session | 401 and 403 are different problems |
| Panel crash | A widget throws in render | Small error boundaries with a retry |
| Silent background failure | Nothing visibly changes | Unhandled rejections leave data quietly stale |
| Runaway render | An effect loops | A render guard turns a frozen tab into an error |
| Corrupted settings | Stored JSON is malformed | Export before you reset |
| Storage full | `QuotaExceededError` | Browser storage is a budget |
| Main thread freeze | The UI stops responding | Move the work to a worker |
| Memory leak | Heap climbs steadily | An interval nobody cleared |
| Live feed drops | Realtime goes quiet | Backoff, staleness, and a polling fallback |

## Two ways to stop choosing faults by hand

- **Chaos monkey** arms and disarms scenarios on its own at a cadence you set, with a blast radius
  capping how many run at once.
- **Scripts** run scripted sequences: *The commute* (offline, back online, expired session),
  *The bad deploy* (version skew, schema drift, a missing chunk) and *The brownout* (slow, then
  flaky, then throttled). They exist to check whether Dispatch keeps its head across several
  incidents instead of treating each one as the first.

## How it is put together

```
src/
├── victim/        Meridian: pages, API client, query hooks, the live feed
├── mocks/         MSW handlers and the fault-injection layer
├── chaos/         Scenario registry, the scenarios, the Chaos Deck
├── incidents/     The bus, detectors, runbooks, remediation actions, the chart
├── assistant/     The Dispatch: WebLLM engine worker, prompts, orchestrator, dock
└── components/    Shell, vitals strip, theme
```

Three ideas carry most of the weight:

- **Faults are data.** A scenario arms a rule; every mock handler consults the rules before doing
  any work. Nothing is special-cased per endpoint.
- **Incidents are the shared language.** Detectors raise them, runbooks explain them, actions
  resolve them, and the model only ever reads a compact summary of them.
- **The model is additive.** Triage cards, runbook steps and every remediation are deterministic.
  The model adds a sentence and a recommendation on top, and its absence costs only that.

## Licence

MIT.
