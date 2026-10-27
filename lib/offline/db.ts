/**
 * Tiny promise wrapper around IndexedDB for device-local data. Nothing here is shared with the
 * server or other people; every record carries the user id it belongs to.
 *
 * Stores
 *   drafts   — pending entries the parent explicitly chose to keep on this phone (key: clientRequestId)
 *   tags     — stickers this person opened online, so a scan with no signal can still show the form
 *   context  — the last signed-in person's family basics (time zone, children) for offline screens
 */

export const DB_NAME = 'nfc-baby'
export type StoreName = 'drafts' | 'tags' | 'context'
const STORES: StoreName[] = ['drafts', 'tags', 'context']

let opening: Promise<IDBDatabase> | null = null

function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

function createMissingStores(db: IDBDatabase) {
  if (!db.objectStoreNames.contains('drafts')) {
    db.createObjectStore('drafts', { keyPath: 'clientRequestId' }).createIndex('userId', 'userId')
  }
  if (!db.objectStoreNames.contains('tags')) db.createObjectStore('tags', { keyPath: 'token' })
  if (!db.objectStoreNames.contains('context')) {
    db.createObjectStore('context', { keyPath: 'userId' })
  }
}

function openAt(version?: number): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME)
    req.onupgradeneeded = () => createMissingStores(req.result)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    // "blocked": another tab still has the old version open; it closes on versionchange, then
    // success fires. Nothing to do but wait.
  })
}

export function openDb(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) return Promise.reject(new Error('IndexedDB unavailable'))
  if (opening) return opening
  opening = (async () => {
    // Open at whatever version exists; if any store is missing (older or foreign database),
    // bump the version once so the upgrade creates it.
    let db = await openAt()
    if (STORES.some((s) => !db.objectStoreNames.contains(s))) {
      const next = db.version + 1
      db.close()
      db = await openAt(next)
    }
    // Another tab upgrading the database: let it, and reopen next time.
    db.onversionchange = () => {
      db.close()
      opening = null
    }
    return db
  })()
  opening.catch(() => {
    opening = null
  })
  return opening
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

export async function put<T>(store: StoreName, value: T): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).put(value)
  await done(tx)
}

export async function get<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openDb()
  return (await result(db.transaction(store).objectStore(store).get(key))) as T | undefined
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb()
  return (await result(db.transaction(store).objectStore(store).getAll())) as T[]
}

export async function remove(store: StoreName, key: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).delete(key)
  await done(tx)
}

/** Wipe every store (sign-out). Clearing is used instead of deleting the database so another
 * open tab cannot block it. */
export async function clearStores(): Promise<void> {
  if (!hasIndexedDb()) return
  const db = await openDb()
  const tx = db.transaction(STORES, 'readwrite')
  for (const s of STORES) tx.objectStore(s).clear()
  await done(tx)
}

/** Test helper: forget the cached connection (fake-indexeddb is reset between tests). */
export function resetDbConnectionForTests() {
  opening = null
}
