import { Directory, File, Paths } from 'expo-file-system';
import { UploadFile } from '../api';

// Durable local storage for voice/photo bytes queued in the offline outbox (Phase 9). Recorded
// audio and picked photos already live at a temporary URI before upload; this just copies them
// into the app's document directory (survives restarts, unlike the cache directory) so a queued
// upload can still find the bytes after the app was closed and reopened while offline. See
// `mediaCache.web.ts` for the browser counterpart (IndexedDB — there's no durable file: URI to copy).

function outboxDir(): Directory {
  return new Directory(Paths.document, 'outbox-media');
}

function ensureDir(dir: Directory) {
  if (!dir.exists) dir.create({ intermediates: true });
}

/** Copies `file` into durable local storage under `key`, alongside a small sidecar with the
 *  name/type needed to reconstruct an {@link UploadFile} for the eventual upload. */
export async function cacheMedia(key: string, file: UploadFile, fileName: string): Promise<void> {
  const dir = outboxDir();
  ensureDir(dir);

  const type = 'type' in file ? file.type : (file as Blob).type || 'application/octet-stream';
  const meta = new File(dir, `${key}.json`);
  meta.create({ overwrite: true });
  meta.write(JSON.stringify({ name: fileName, type }));

  const dest = new File(dir, key);
  if ('uri' in file) {
    // Native shape: copy the recorder/picker's temp file into our durable outbox directory.
    await new File(file.uri).copy(dest, { overwrite: true });
  } else {
    // Shouldn't happen on native (Blob only occurs on web) — handled defensively anyway.
    const bytes = new Uint8Array(await (file as Blob).arrayBuffer());
    dest.create({ overwrite: true });
    dest.write(bytes);
  }
}

/** Reconstructs a previously cached file for re-upload, or null if it's missing (e.g. evicted by
 *  the OS under storage pressure — the caller should drop the queued op rather than retry forever). */
export async function loadCachedMedia(key: string): Promise<UploadFile | null> {
  const dir = outboxDir();
  const dest = new File(dir, key);
  const meta = new File(dir, `${key}.json`);
  if (!dest.exists || !meta.exists) return null;
  try {
    const { name, type } = JSON.parse(await meta.text());
    return { uri: dest.uri, name, type };
  } catch {
    return null;
  }
}

/** Removes a cached file + sidecar once it's been uploaded (or the op was dropped). */
export async function deleteCachedMedia(key: string): Promise<void> {
  const dir = outboxDir();
  for (const f of [new File(dir, key), new File(dir, `${key}.json`)]) {
    try {
      if (f.exists) f.delete();
    } catch {
      // best-effort cleanup
    }
  }
}
