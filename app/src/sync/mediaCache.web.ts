import { UploadFile } from '../api';

// Durable local storage for voice/photo bytes queued in the offline outbox (Phase 9), web target.
// There's no persistent file: URI to copy back to (browser recordings/picks are only ever an
// in-memory Blob), so this stores the Blob itself in IndexedDB — the one browser storage that
// holds binary data durably across reloads without the size/type constraints of localStorage.
// See `mediaCache.ts` for the native counterpart.

const DB_NAME = 'wander-media-outbox';
const STORE = 'media';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Stores `file`'s Blob under `key` (the Blob's own `type` survives the IndexedDB round-trip). */
export async function cacheMedia(key: string, file: UploadFile, fileName: string): Promise<void> {
  const db = await openDb();
  if (!db) return; // best-effort: if IndexedDB is unavailable, the flush will find nothing and drop the op
  const blob = 'uri' in file ? await (await fetch(file.uri)).blob() : file;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ blob, name: fileName }, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Returns the cached Blob for `key`, or null if it's missing (never cached, or evicted). */
export async function loadCachedMedia(key: string): Promise<UploadFile | null> {
  const db = await openDb();
  if (!db) return null;
  const record = await new Promise<{ blob: Blob; name: string } | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return record?.blob ?? null;
}

/** Removes a cached blob once it's been uploaded (or the op was dropped). */
export async function deleteCachedMedia(key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
