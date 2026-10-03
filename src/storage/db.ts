// Local storage on the device, in IndexedDB.
// Every store uses explicit keys, so records stay plain objects.
// If IndexedDB is unavailable (some private-browsing modes), data lives in memory
// for the session and the app still works.

export type StoreName = 'profiles' | 'progress' | 'settings' | 'meta';

const DB_NAME = 'chessit';
// Bump when stores change, and migrate in onupgradeneeded.
export const SCHEMA_VERSION = 1;
const STORES: StoreName[] = ['profiles', 'progress', 'settings', 'meta'];

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<StoreName, Map<string, unknown>>(STORES.map((s) => [s, new Map()]));

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      let req: IDBOpenDBRequest;
      try {
        req = indexedDB.open(DB_NAME, SCHEMA_VERSION);
      } catch {
        resolve(null);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn('IndexedDB unavailable, keeping data in memory only', req.error);
        resolve(null);
      };
      req.onblocked = () => resolve(null);
    });
  }
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        if (!db) {
          reject(new Error('no-db'));
          return;
        }
        const tx = db.transaction(store, mode);
        const req = op(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

export async function dbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  try {
    return await run<T | undefined>(store, 'readonly', (s) => s.get(key));
  } catch {
    return memory.get(store)!.get(key) as T | undefined;
  }
}

export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  try {
    return await run<T[]>(store, 'readonly', (s) => s.getAll());
  } catch {
    return [...memory.get(store)!.values()] as T[];
  }
}

export async function dbPut<T>(store: StoreName, key: string, value: T): Promise<void> {
  try {
    await run(store, 'readwrite', (s) => s.put(value, key));
  } catch {
    memory.get(store)!.set(key, value);
  }
}

export async function dbDelete(store: StoreName, key: string): Promise<void> {
  try {
    await run(store, 'readwrite', (s) => s.delete(key));
  } catch {
    memory.get(store)!.delete(key);
  }
}

export async function dbKeys(store: StoreName): Promise<string[]> {
  try {
    return (await run<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys())).map(String);
  } catch {
    return [...memory.get(store)!.keys()];
  }
}

/** One change in a `dbWrite` batch. `clear` empties the whole store. */
export type DbOp =
  | { store: StoreName; op: 'put'; key: string; value: unknown }
  | { store: StoreName; op: 'delete'; key: string }
  | { store: StoreName; op: 'clear' };

/**
 * Several changes over several stores, all or nothing (one IndexedDB transaction).
 * Used by restoring a backup and by "delete all data": a failure halfway leaves the old data as it was.
 */
export async function dbWrite(ops: DbOp[]): Promise<void> {
  const stores = [...new Set(ops.map((o) => o.store))];
  if (stores.length === 0) return;
  const db = await openDb();
  if (!db) {
    for (const o of ops) {
      const m = memory.get(o.store)!;
      if (o.op === 'clear') m.clear();
      else if (o.op === 'delete') m.delete(o.key);
      else m.set(o.key, o.value);
    }
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    for (const o of ops) {
      const s = tx.objectStore(o.store);
      if (o.op === 'clear') s.clear();
      else if (o.op === 'delete') s.delete(o.key);
      else s.put(o.value, o.key);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('aborted'));
  });
}

export const ALL_STORES: readonly StoreName[] = STORES;

/** Ask the browser not to evict our data under storage pressure. Best effort. */
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) {
      await navigator.storage.persist?.();
    }
  } catch {
    // Not supported: nothing to do.
  }
}
