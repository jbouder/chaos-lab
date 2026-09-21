import { atom } from "jotai";
import type { RemediationId } from "@/incidents/types";
import { uid } from "@/lib/ids";
import { appStore } from "@/store/store";
import type { Persona } from "./prompt";

export type DispatchMessage = {
  id: string;
  role: "user" | "dispatch" | "note";
  text: string;
  at: number;
  actions?: RemediationId[];
  incidentId?: string;
  streaming?: boolean;
  /** Set when the text came from the rules, not the model. */
  deterministic?: boolean;
};

export const dockOpenAtom = atom(false);
export const messagesAtom = atom<DispatchMessage[]>([]);
export const unreadAtom = atom(0);
export const focusIncidentIdAtom = atom<string | null>(null);

export type DispatchSettings = {
  persona: Persona;
  /** Allow Dispatch to run `safe` actions without a click. */
  autonomy: boolean;
  /** Suppress auto-opening the dock on new incidents. */
  doNotInterrupt: boolean;
  /** Start downloading the model when the tab goes idle. */
  warmOnIdle: boolean;
};

const SETTINGS_KEY = "chaos-lab:dispatch";

function loadSettings(): DispatchSettings {
  const fallback: DispatchSettings = {
    persona: "dispatch",
    autonomy: false,
    doNotInterrupt: false,
    warmOnIdle: true,
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<DispatchSettings>) } : fallback;
  } catch {
    return fallback;
  }
}

export const settingsAtom = atom<DispatchSettings>(loadSettings());

export function updateSettings(patch: Partial<DispatchSettings>): void {
  const next = { ...appStore.get(settingsAtom), ...patch };
  appStore.set(settingsAtom, next);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Storage may be full — the setting still applies for this session.
  }
}

export function getSettings(): DispatchSettings {
  return appStore.get(settingsAtom);
}

export function getMessages(): DispatchMessage[] {
  return appStore.get(messagesAtom);
}

export function appendMessage(message: Omit<DispatchMessage, "id" | "at">): DispatchMessage {
  const full: DispatchMessage = { ...message, id: uid("msg"), at: Date.now() };
  appStore.set(messagesAtom, [...getMessages(), full]);
  if (!appStore.get(dockOpenAtom) && message.role !== "user") {
    appStore.set(unreadAtom, appStore.get(unreadAtom) + 1);
  }
  return full;
}

export function patchMessage(id: string, patch: Partial<DispatchMessage>): void {
  appStore.set(
    messagesAtom,
    getMessages().map((message) => (message.id === id ? { ...message, ...patch } : message)),
  );
}

export function openDock(incidentId?: string): void {
  appStore.set(dockOpenAtom, true);
  appStore.set(unreadAtom, 0);
  if (incidentId) appStore.set(focusIncidentIdAtom, incidentId);
}

export function closeDock(): void {
  appStore.set(dockOpenAtom, false);
}

export function clearConversation(): void {
  appStore.set(messagesAtom, []);
  appStore.set(focusIncidentIdAtom, null);
}
