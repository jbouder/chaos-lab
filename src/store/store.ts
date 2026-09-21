import { createStore } from "jotai";

/**
 * A single Jotai store instance shared by React and by the non-React parts of
 * the app (detectors, the MSW fault layer, the Medic orchestrator). Anything
 * outside a component reads and writes through `appStore` directly.
 */
export const appStore = createStore();
