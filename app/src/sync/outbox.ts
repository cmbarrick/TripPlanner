import { useSyncExternalStore } from 'react';
import { readJson, writeJson } from '../storage';
import { CreateNoteInput, CreateVoiceNoteFields, CreatePhotoNoteFields, UploadFile } from '../api';
import { cacheMedia, deleteCachedMedia } from './mediaCache';

// Lightweight offline-first outbox for journal writes (Phase 4, Slice 5; extended to voice/photo
// media in Phase 9). Text notes, prompt responses, edits, and deletes created while offline are
// queued here, persisted to local storage, and replayed in order once connectivity returns. Voice
// and photo captures queue the same way, but the audio/image bytes themselves are too large for
// this small KV store — they're copied into durable local storage by `mediaCache` (native:
// document directory; web: IndexedDB) and the queued op just carries a lookup key.

const STORAGE_KEY = 'wander.sync.outbox.v1';

/** A queued journal write awaiting replay. `id` is the op id; `tempNoteId` links a create to the
 *  optimistic note shown in the UI so later edits/deletes can be folded into the pending create. */
export type OutboxOp =
  | { id: string; kind: 'note.create'; tripId: string; tempNoteId: string; input: CreateNoteInput; createdAt: string }
  | { id: string; kind: 'note.update'; tripId: string; noteId: string; bodyText: string; createdAt: string }
  | { id: string; kind: 'note.delete'; tripId: string; noteId: string; createdAt: string }
  | {
      id: string;
      kind: 'note.media';
      tripId: string;
      tempNoteId: string;
      mediaKind: 'Voice' | 'Photo';
      /** Lookup key into `mediaCache` for the actual audio/image bytes. */
      cacheKey: string;
      fileName: string;
      fields: CreateVoiceNoteFields | CreatePhotoNoteFields;
      createdAt: string;
    };

/** Result of attempting one op during a flush. */
export type FlushOutcome =
  // Succeeded — remove from the queue.
  | 'done'
  // Still offline (network error) — stop the flush and keep the queue for the next attempt.
  | 'retry'
  // Server rejected it (4xx/validation); retrying can't help, so drop it to avoid a poison-pill loop.
  | 'drop';

/** Reactive snapshot for {@link useOutbox}. Bundling `ops` and `blocked` into one object (rather
 *  than exposing them as separate module variables) means a `blocked`-only change still produces a
 *  new snapshot reference, which `useSyncExternalStore` needs to know to re-render — it bails out
 *  when the snapshot it reads is `Object.is`-equal to the last one. */
type OutboxSnapshot = { ops: OutboxOp[]; blocked: boolean };

let ops: OutboxOp[] = [];
/** True once a flush attempt has stopped on a `retry` outcome (network/offline) with the queue
 *  still non-empty — cleared on the next flush that either drains fully or finds nothing queued. */
let blocked = false;
let snapshot: OutboxSnapshot = { ops, blocked };
let loaded = false;
let loading: Promise<void> | null = null;
let flushing = false;
const listeners = new Set<() => void>();

function emit() {
  snapshot = { ops, blocked };
  for (const l of listeners) l();
}

function setBlocked(next: boolean) {
  if (blocked === next) return;
  blocked = next;
  emit();
}

async function persist() {
  await writeJson(STORAGE_KEY, ops);
}

function ensureLoaded() {
  if (loaded || loading) return;
  loading = readJson<OutboxOp[]>(STORAGE_KEY, []).then((saved) => {
    ops = Array.isArray(saved) ? saved : [];
    loaded = true;
    loading = null;
    emit();
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  ensureLoaded();
  return () => listeners.delete(cb);
}

/** Resolves once the persisted queue has been hydrated into memory. Enqueue/flush paths await this
 *  so they never mutate (and then re-persist) a stale empty queue before the load completes. */
async function ready(): Promise<void> {
  ensureLoaded();
  if (loading) await loading;
}

function getSnapshot(): OutboxSnapshot {
  return snapshot;
}

/** Best-effort UUID; falls back when crypto.randomUUID is unavailable (some RN runtimes). */
function newId(): string {
  const c: any = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'op-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** A stable temp id for an optimistic, not-yet-synced note. */
export function newTempNoteId(): string {
  return 'temp-' + newId();
}

/** True for the optimistic ids minted by {@link newTempNoteId}. */
export function isTempNoteId(id: string): boolean {
  return id.startsWith('temp-');
}

async function commit(next: OutboxOp[]) {
  ops = next;
  emit();
  await persist();
}

/**
 * Queues a note create. Returns the temp note id so the caller can render an optimistic entry whose
 * later edits/deletes fold back into this op (see {@link enqueueNoteUpdate}/{@link enqueueNoteDelete}).
 */
export async function enqueueNoteCreate(tripId: string, input: CreateNoteInput): Promise<string> {
  await ready();
  const tempNoteId = newTempNoteId();
  const op: OutboxOp = { id: newId(), kind: 'note.create', tripId, tempNoteId, input, createdAt: new Date().toISOString() };
  await commit([...ops, op]);
  return tempNoteId;
}

/** Queues a note edit, folding into a still-pending create/update for the same note when possible. */
export async function enqueueNoteUpdate(tripId: string, noteId: string, bodyText: string): Promise<void> {
  await ready();
  // Editing a note that hasn't synced yet: update the queued create in place.
  const pendingCreate = ops.find((o) => o.kind === 'note.create' && o.tempNoteId === noteId);
  if (pendingCreate && pendingCreate.kind === 'note.create') {
    await commit(
      ops.map((o) =>
        o === pendingCreate ? { ...o, input: { ...o.input, bodyText } } : o,
      ),
    );
    return;
  }
  // Same for a still-queued photo note's caption (voice notes aren't caption-editable — see
  // NoteCard's `editable` check — but photo notes are, same as once they've synced).
  const pendingMedia = ops.find((o) => o.kind === 'note.media' && o.tempNoteId === noteId);
  if (pendingMedia && pendingMedia.kind === 'note.media') {
    await commit(
      ops.map((o) =>
        o === pendingMedia ? { ...o, fields: { ...o.fields, bodyText } } : o,
      ),
    );
    return;
  }
  // Collapse repeated edits of the same note into a single pending update.
  const pendingUpdate = ops.find((o) => o.kind === 'note.update' && o.noteId === noteId);
  if (pendingUpdate && pendingUpdate.kind === 'note.update') {
    await commit(ops.map((o) => (o === pendingUpdate ? { ...o, bodyText } : o)));
    return;
  }
  const op: OutboxOp = { id: newId(), kind: 'note.update', tripId, noteId, bodyText, createdAt: new Date().toISOString() };
  await commit([...ops, op]);
}

/**
 * Queues a voice/photo note captured offline. The file is copied into durable local storage
 * (`mediaCache`) under a fresh key first — the outbox op itself only carries that key, never the
 * bytes — then the op is queued like any other write. Returns the temp note id.
 */
export async function enqueueMediaNote(
  tripId: string,
  mediaKind: 'Voice' | 'Photo',
  fields: CreateVoiceNoteFields | CreatePhotoNoteFields,
  file: UploadFile,
  fileName: string,
): Promise<string> {
  await ready();
  const tempNoteId = newTempNoteId();
  const cacheKey = tempNoteId;
  await cacheMedia(cacheKey, file, fileName);
  const op: OutboxOp = {
    id: newId(),
    kind: 'note.media',
    tripId,
    tempNoteId,
    mediaKind,
    cacheKey,
    fileName,
    fields,
    createdAt: new Date().toISOString(),
  };
  await commit([...ops, op]);
  return tempNoteId;
}

/** Queues a note delete. If the note never synced, its queued create/media (and edits) are simply
 *  dropped, including any cached media bytes. */
export async function enqueueNoteDelete(tripId: string, noteId: string): Promise<void> {
  await ready();
  const hasPendingCreate = ops.some((o) => o.kind === 'note.create' && o.tempNoteId === noteId);
  const pendingMedia = ops.find((o) => o.kind === 'note.media' && o.tempNoteId === noteId);
  if (hasPendingCreate) {
    // Never reached the server — discard the create and any edits; no delete op needed.
    await commit(
      ops.filter(
        (o) =>
          !(o.kind === 'note.create' && o.tempNoteId === noteId) &&
          !(o.kind === 'note.update' && o.noteId === noteId),
      ),
    );
    return;
  }
  if (pendingMedia && pendingMedia.kind === 'note.media') {
    // Same story for a still-queued voice/photo note — plus its cached bytes never uploaded.
    await commit(ops.filter((o) => o !== pendingMedia));
    await deleteCachedMedia(pendingMedia.cacheKey);
    return;
  }
  // Drop any pending edits (the server copy is going away) and queue the delete.
  const withoutUpdates = ops.filter((o) => !(o.kind === 'note.update' && o.noteId === noteId));
  const op: OutboxOp = { id: newId(), kind: 'note.delete', tripId, noteId, createdAt: new Date().toISOString() };
  await commit([...withoutUpdates, op]);
}

/** Removes an op by id (used by the flusher after a terminal outcome). */
export async function removeOp(id: string): Promise<void> {
  await commit(ops.filter((o) => o.id !== id));
}

/**
 * Replays queued ops in FIFO order via `runner`. Stops at the first `retry` (still offline) so order
 * is preserved and we don't hammer a down network. Returns the count successfully drained.
 * Concurrency-guarded: overlapping calls are no-ops.
 */
export async function flushOutbox(runner: (op: OutboxOp) => Promise<FlushOutcome>): Promise<number> {
  if (flushing) return 0;
  await ready();
  if (ops.length === 0) {
    setBlocked(false);
    return 0;
  }
  flushing = true;
  let synced = 0;
  let hitRetry = false;
  try {
    // Snapshot ids up front; the queue can be mutated by the UI mid-flush.
    const queue = [...ops];
    for (const op of queue) {
      if (!ops.some((o) => o.id === op.id)) continue; // removed by the UI meanwhile
      let outcome: FlushOutcome;
      try {
        outcome = await runner(op);
      } catch {
        outcome = 'retry';
      }
      if (outcome === 'retry') {
        hitRetry = true;
        break;
      }
      await removeOp(op.id);
      // A dropped op leaves the queue but wasn't a successful sync, so don't count it.
      if (outcome === 'done') synced += 1;
    }
  } finally {
    flushing = false;
  }
  setBlocked(hitRetry);
  return synced;
}

/** Reactive snapshot of the queued ops (for a "pending sync" indicator): the ops themselves, a
 *  convenience count, and whether the last flush attempt stopped on a network failure with work
 *  still queued (an "offline/blocked" signal — see {@link OutboxSnapshot}). */
export function useOutbox(): { ops: OutboxOp[]; pendingCount: number; blocked: boolean } {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ops: current.ops, pendingCount: current.ops.length, blocked: current.blocked };
}

/** Test-only: reset in-memory state. */
export function __resetOutboxForTests() {
  ops = [];
  blocked = false;
  snapshot = { ops, blocked };
  loaded = false;
  loading = null;
  flushing = false;
}
