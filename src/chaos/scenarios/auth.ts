import { resolveKind } from "@/incidents/bus";
import { armFault, disarmFault } from "@/mocks/faults";
import type { ScenarioDefinition } from "../registry";

export const authScenarios: ScenarioDefinition[] = [
  {
    id: "session-expired",
    title: "Session expiry",
    category: "auth",
    kind: "session-expired",
    severity: "error",
    symptom: "Requests start returning 401 and the silent refresh fails.",
    lesson:
      "Losing a session mid-form is the fastest way to lose a user's work. Save the draft first, re-authenticate second, restore third.",
    arm: () =>
      armFault({
        id: "session-expired",
        scope: "all",
        fault: { kind: "authExpired", refreshFails: true },
      }),
    disarm: () => {
      disarmFault("session-expired");
      resolveKind("session-expired", "The session was renewed.");
    },
  },
  {
    id: "clock-skew",
    title: "Device clock is wrong",
    category: "auth",
    kind: "clock-skew",
    severity: "error",
    symptom: "Auth fails because the token looks 'not yet valid' to the server.",
    lesson:
      "Some failures cannot be fixed inside the app at all. Naming the real cause, the device clock, saves an hour of hunting in the wrong place.",
    knobs: [
      {
        id: "skew",
        label: "Clock offset",
        min: 60,
        max: 3600,
        step: 60,
        defaultValue: 900,
        unit: "s",
      },
    ],
    arm: ({ knob }) =>
      armFault({
        id: "clock-skew",
        scope: "all",
        fault: { kind: "clockSkew", skewMs: knob("skew") * 1000 },
      }),
    disarm: () => {
      disarmFault("clock-skew");
      resolveKind("clock-skew", "The clock offset was corrected.");
    },
  },
  {
    id: "forbidden",
    title: "Permission revoked",
    category: "auth",
    kind: "forbidden",
    severity: "error",
    symptom: "The API answers 403 even though the session is perfectly valid.",
    lesson:
      "401 and 403 are different problems. Telling a signed-in user to sign in again, when their role simply changed, sends them in a circle.",
    arm: () => armFault({ id: "forbidden", scope: "all", fault: { kind: "forbidden" } }),
    disarm: () => {
      disarmFault("forbidden");
      resolveKind("forbidden", "Permissions were restored.");
    },
  },
];
