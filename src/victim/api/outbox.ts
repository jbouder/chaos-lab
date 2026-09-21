import { type IDBPDatabase, openDB } from "idb";
import { atom } from "jotai";
import { uid } from "@/lib/ids";
import { appStore } from "@/store/store";

export type OutboxItem = {
  id: string;
  path: string;
  method: string;
  body: unknown;
  queuedAt: number;
  label: string;
  idempotencyKey: string;
};

const DB_NAME = "chaos-lab";
const STORE = "outbox";

export const outboxAtom = atom<OutboxItem[]>([]);

let dbPromise: Promise<IDBPDatabase> | null = null;

function database(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

async function sync(): Promise<OutboxItem[]> {
  const db = await database();
  const items = (await db.getAll(STORE)) as OutboxItem[];
  const sorted = items.sort((a, b) => a.queuedAt - b.queuedAt);
  appStore.set(outboxAtom, sorted);
  return sorted;
}

export async function loadOutbox(): Promise<OutboxItem[]> {
  return sync();
}

export async function enqueue(
  input: Omit<OutboxItem, "id" | "queuedAt" | "idempotencyKey">,
): Promise<OutboxItem> {
  const item: OutboxItem = {
    ...input,
    id: uid("out"),
    queuedAt: Date.now(),
    idempotencyKey: uid("idem"),
  };
  const db = await database();
  await db.put(STORE, item);
  await sync();
  return item;
}

export async function dequeue(id: string): Promise<void> {
  const db = await database();
  await db.delete(STORE, id);
  await sync();
}

export async function clearOutbox(): Promise<void> {
  const db = await database();
  await db.clear(STORE);
  await sync();
}

export function outboxSize(): number {
  return appStore.get(outboxAtom).length;
}
