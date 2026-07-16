import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  createNote,
  updateNote,
  deleteNote,
  createVoiceNote,
  createPhotoNote,
  CreateVoiceNoteFields,
  CreatePhotoNoteFields,
} from '../api';
import { tripNotesQueryKey } from '../queries/notes';
import { flushOutbox, FlushOutcome, OutboxOp } from './outbox';
import { loadCachedMedia, deleteCachedMedia } from './mediaCache';

/** Replays one queued op. Network/5xx failures retry later; 4xx rejections are dropped. */
export async function runOp(op: OutboxOp): Promise<FlushOutcome> {
  try {
    if (op.kind === 'note.create') await createNote(op.tripId, op.input);
    else if (op.kind === 'note.update') await updateNote(op.noteId, op.bodyText);
    else if (op.kind === 'note.delete') await deleteNote(op.noteId);
    else if (op.kind === 'note.media') {
      const file = await loadCachedMedia(op.cacheKey);
      // The cached bytes are gone (e.g. evicted under storage pressure) — nothing left to retry.
      if (!file) return 'drop';
      if (op.mediaKind === 'Voice') {
        await createVoiceNote(op.tripId, op.fields as CreateVoiceNoteFields, file, op.fileName);
      } else {
        await createPhotoNote(op.tripId, op.fields as CreatePhotoNoteFields, file, op.fileName);
      }
      await deleteCachedMedia(op.cacheKey);
    }
    return 'done';
  } catch (e) {
    // A client error (validation/not-found) won't succeed on retry — drop it. Anything else
    // (no response, timeout, 5xx) is transient: keep it queued.
    if (e instanceof ApiError && e.status !== undefined && e.status >= 400 && e.status < 500) {
      if (op.kind === 'note.media') await deleteCachedMedia(op.cacheKey).catch(() => {});
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
