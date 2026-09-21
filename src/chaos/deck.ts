import { atom } from "jotai";
import { appStore } from "@/store/store";

/**
 * The deck starts collapsed: the point of the lab is the app under test, not
 * the switches. The header toggle brings it back.
 */
export const deckOpenAtom = atom(false);

export function toggleDeck(): void {
  appStore.set(deckOpenAtom, !appStore.get(deckOpenAtom));
}

export function closeDeck(): void {
  appStore.set(deckOpenAtom, false);
}
