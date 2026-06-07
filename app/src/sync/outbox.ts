import { useSyncExternalStore } from 'react';
import { readJson, writeJson } from '../storage';
import { CreateNoteInput } from '../api';

// Lightweight offline-first outbox for journal writes (Phase 4, Slice 5). Text notes, prompt
// responses, edits, and deletes created while offline are queued here, persisted to local storage,
// and replayed in order once connectivity returns. Media capture (voice/photo) is intentionally out
// of scope for this slice — large blobs can't live in the small KV store — and is deferred to the
// Phase 9 sync hardening pass.

const STORAGE_KEY = 'wander.sync.outbox.v1';

/** A queued journal write awaiting replay. `id` is the op id; `tempNoteId` links a create to the
 *  optimistic note shown in the UI so later edits/deletes can be folded into the pending create. */
export type OutboxOp =
  | { id: string; kind: 'note.create'; tripId: string; tempNoteId: string; input: CreateNoteInput; createdAt: string }
  | { id: string; kind: 'note.update'; tripId: string; noteId: string; bodyText: string; createdAt: string }
  | { id: string; kind: 'note.delete'; tripId: string; noteId: string; createdAt: string };

/** Result of attempting one op during a flush. */
export type FlushOutcome =
  // Succeeded — remove from the queue.
  | 'done'
  // Still offline (network error) — stop the flush and keep the queue for the next attempt.
  | 'retry'
  // Server rejected it (4xx/validation); retrying can't help, so drop it to avoid a poison-pill loop.
  | 'drop';

let ops: OutboxOp[] = [];
let loaded = false;
let loading: Promise<void> | null = null;
let flushing = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
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

function getSnapshot(): OutboxOp[] {
  return ops;
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
  // Collapse repeated edits of the same note into a single pending update.
  const pendingUpdate = ops.find((o) => o.kind === 'note.update' && o.noteId === noteId);
  if (pendingUpdate && pendingUpdate.kind === 'note.update') {
    await commit(ops.map((o) => (o === pendingUpdate ? { ...o, bodyText } : o)));
    return;
  }
  const op: OutboxOp = { id: newId(), kind: 'note.update', tripId, noteId, bodyText, createdAt: new Date().toISOString() };
  await commit([...ops, op]);
}

/** Queues a note delete. If the note never synced, its queued create (and edits) are simply dropped. */
export async function enqueueNoteDelete(tripId: string, noteId: string): Promise<void> {
  await ready();
  const hasPendingCreate = ops.some((o) => o.kind === 'note.create' && o.tempNoteId === noteId);
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
  if (ops.length === 0) return 0;
  flushing = true;
  let synced = 0;
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
      if (outcome === 'retry') break;
      await removeOp(op.id);
      // A dropped op leaves the queue but wasn't a successful sync, so don't count it.
      if (outcome === 'done') synced += 1;
    }
  } finally {
    flushing = false;
  }
  return synced;
}

/** Reactive snapshot of the queued ops (for a "pending sync" indicator). */
export function useOutbox(): { ops: OutboxOp[]; pendingCount: number } {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ops: current, pendingCount: current.length };
}

/** Test-only: reset in-memory state. */
export function __resetOutboxForTests() {
  ops = [];
  loaded = false;
  loading = null;
  flushing = false;
}
