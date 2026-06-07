import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, createNote, updateNote, deleteNote } from '../api';
import { tripNotesQueryKey } from '../queries/notes';
import { flushOutbox, FlushOutcome, OutboxOp } from './outbox';

/** Replays one queued op. Network/5xx failures retry later; 4xx rejections are dropped. */
async function runOp(op: OutboxOp): Promise<FlushOutcome> {
  try {
    if (op.kind === 'note.create') await createNote(op.tripId, op.input);
    else if (op.kind === 'note.update') await updateNote(op.noteId, op.bodyText);
    else if (op.kind === 'note.delete') await deleteNote(op.noteId);
    return 'done';
  } catch (e) {
    // A client error (validation/not-found) won't succeed on retry — drop it. Anything else
    // (no response, timeout, 5xx) is transient: keep it queued.
    if (e instanceof ApiError && e.status !== undefined && e.status >= 400 && e.status < 500) {
      return 'drop';
    }
    return 'retry';
  }
}

/**
 * Drives the offline outbox: replays queued journal writes whenever connectivity likely returned
 * (app start, web `online` event, return to foreground, and a slow safety-net interval) and
 * refreshes the affected trips' notes once anything drains. Mounted once near the app root.
 */
export function useOutboxSync(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    const flush = async () => {
      const affected = new Set<string>();
      const drained = await flushOutbox(async (op) => {
        const outcome = await runOp(op);
        if (outcome === 'done') affected.add(op.tripId);
        return outcome;
      });
      if (cancelled || drained === 0) return;
      for (const tripId of affected) {
        queryClient.invalidateQueries({ queryKey: tripNotesQueryKey(tripId) });
      }
    };

    void flush();
    const interval = setInterval(() => void flush(), 20_000);

    const onOnline = () => void flush();
    const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
    if (isWeb) window.addEventListener('online', onOnline);
    const appStateSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void flush();
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (isWeb) window.removeEventListener('online', onOnline);
      appStateSub.remove();
    };
  }, [queryClient]);
}
