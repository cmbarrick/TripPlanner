import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createNote,
  createPhotoNote,
  createVoiceNote,
  deleteNote,
  updateNote,
  getTripNotes,
  isOfflineError,
  CreateNoteInput,
  CreatePhotoNoteFields,
  CreateVoiceNoteFields,
  UploadFile,
} from '../api';
import { Note, NoteScope } from '../types';
import {
  enqueueNoteCreate,
  enqueueNoteUpdate,
  enqueueNoteDelete,
  enqueueMediaNote,
  isTempNoteId,
  useOutbox,
  OutboxOp,
} from '../sync/outbox';

export const tripNotesQueryKey = (tripId: string) => ['notes', tripId] as const;

/** Builds the placeholder note rendered while a queued create awaits sync. `createdAt` defaults to
 *  now (a fresh capture) but callers reconstructing from a persisted op pass its original
 *  timestamp, so the entry sorts consistently instead of jumping to "just now" every render. */
function buildOptimisticNote(
  tripId: string,
  tempId: string,
  input: CreateNoteInput,
  createdAt: string = new Date().toISOString(),
): Note {
  return {
    id: tempId,
    tripId,
    ownerId: '',
    scope: input.scope,
    targetId: input.targetId ?? null,
    kind: input.kind ?? 'Text',
    bodyText: input.bodyText ?? null,
    promptId: input.promptId ?? null,
    promptText: input.promptText ?? null,
    mediaAssets: [],
    createdAt,
    updatedAt: createdAt,
    pendingSync: true,
  };
}

/** Builds the placeholder note rendered while a queued voice/photo note awaits sync. There's no
 *  MediaAsset yet (the bytes live in `mediaCache`, not the server) — `pendingMediaKind` tells the
 *  UI what kind of media to indicate instead of rendering a player/photo. */
function buildOptimisticMediaNote(
  tripId: string,
  tempId: string,
  mediaKind: 'Voice' | 'Photo',
  fields: { scope: NoteScope; targetId?: string | null; bodyText?: string | null },
  createdAt: string = new Date().toISOString(),
): Note {
  return {
    id: tempId,
    tripId,
    ownerId: '',
    scope: fields.scope,
    targetId: fields.targetId ?? null,
    // Matches the server's kind assignment: voice notes are kind 'Voice'; photo notes are kind
    // 'Text' with a Photo MediaAsset attached (see NotesController).
    kind: mediaKind === 'Voice' ? 'Voice' : 'Text',
    bodyText: fields.bodyText ?? null,
    promptId: null,
    promptText: null,
    mediaAssets: [],
    createdAt,
    updatedAt: createdAt,
    pendingSync: true,
    pendingMediaKind: mediaKind,
  };
}

/**
 * Overlays this trip's queued-but-unsynced outbox ops onto a fetched notes list: pending
 * creates/media notes are added, a pending edit shows on the real note it targets, and a pending
 * delete removes its target. Deriving this from the outbox on every render (rather than patching
 * the query cache from each mutation's `onSuccess`) means a pending capture shows up correctly
 * even right after a fresh page load — before this, an optimistic note only ever existed in the
 * in-memory query cache, so it silently vanished from the list across a reload despite the queued
 * op (and, for media, its cached bytes) still being there and still syncing correctly later.
 */
function mergeWithPendingOps(tripId: string, notes: Note[], ops: OutboxOp[]): Note[] {
  let merged = notes;
  const pending: Note[] = [];
  for (const op of ops) {
    if (op.tripId !== tripId) continue;
    if (op.kind === 'note.create') {
      pending.push(buildOptimisticNote(tripId, op.tempNoteId, op.input, op.createdAt));
    } else if (op.kind === 'note.media') {
      pending.push(buildOptimisticMediaNote(tripId, op.tempNoteId, op.mediaKind, op.fields, op.createdAt));
    } else if (op.kind === 'note.update') {
      merged = merged.map((n) => (n.id === op.noteId ? { ...n, bodyText: op.bodyText, pendingSync: true } : n));
    } else if (op.kind === 'note.delete') {
      merged = merged.filter((n) => n.id !== op.noteId);
    }
  }
  if (pending.length === 0) return merged;
  return [...pending, ...merged].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** All notes for a trip (newest first), with any queued-but-unsynced writes overlaid — see
 *  {@link mergeWithPendingOps}. Used for the per-event "has notes" indicator and the event journal
 *  section. Short stale time so newly added notes show up promptly. */
export function useTripNotesQuery(tripId: string) {
  const query = useQuery({
    queryKey: tripNotesQueryKey(tripId),
    queryFn: async () => {
      const res = await getTripNotes(tripId);
      // A failed/aborted/timed-out read returns the empty fallback with `live: false`. Throw so
      // React Query treats it as an error (retried, and never cached as a "fresh" empty list) —
      // otherwise one slow read (e.g. an API cold start) pins an empty journal for the whole
      // staleTime window, so existing notes only appear after a write forces a refetch.
      if (!res.live) throw new Error('Notes are temporarily unavailable.');
      return res;
    },
    staleTime: 1000 * 30,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    // While any voice note is still transcribing, poll so the transcript appears on its own
    // (the async Function posts it back ~10–30s later); stop once nothing is pending.
    refetchInterval: (query) => {
      const notes = query.state.data?.data;
      const transcribing = notes?.some((n) =>
        n.mediaAssets?.some((m) => m.transcriptionStatus === 'Pending'),
      );
      return transcribing ? 5000 : false;
    },
  });

  const { ops } = useOutbox();
  const data = useMemo(() => {
    if (query.data) return { ...query.data, data: mergeWithPendingOps(tripId, query.data.data, ops) };
    // The fetch is still loading or failed outright (e.g. cold-started fully offline) — surface
    // whatever's queued anyway rather than showing nothing until a real list is available.
    const pendingOnly = mergeWithPendingOps(tripId, [], ops);
    return pendingOnly.length > 0 ? { data: pendingOnly, live: false } : query.data;
  }, [query.data, ops, tripId]);

  return { ...query, data };
}

export function useCreateNoteMutation(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateNoteInput): Promise<Note> => {
      try {
        return await createNote(tripId, input);
      } catch (e) {
        if (!isOfflineError(e)) throw e;
        // Offline: queue the write and hand back an optimistic note so the UI accepts it.
        const tempId = await enqueueNoteCreate(tripId, input);
        return buildOptimisticNote(tripId, tempId, input);
      }
    },
    // A queued (pendingSync) result needs no cache update — useTripNotesQuery derives it from the
    // outbox directly. Only a real server write needs a refetch.
    onSuccess: (note) => {
      if (!note.pendingSync) queryClient.invalidateQueries({ queryKey: tripNotesQueryKey(tripId) });
    },
  });
}

export function useCreateVoiceNoteMutation(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fields,
      audio,
      fileName,
    }: {
      fields: CreateVoiceNoteFields;
      audio: UploadFile;
      fileName: string;
    }): Promise<Note> => {
      try {
        return await createVoiceNote(tripId, fields, audio, fileName);
      } catch (e) {
        if (!isOfflineError(e)) throw e;
        const tempId = await enqueueMediaNote(tripId, 'Voice', fields, audio, fileName);
        return buildOptimisticMediaNote(tripId, tempId, 'Voice', fields);
      }
    },
    onSuccess: (note) => {
      if (!note.pendingSync) queryClient.invalidateQueries({ queryKey: tripNotesQueryKey(tripId) });
    },
  });
}

export function useCreatePhotoNoteMutation(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fields,
      image,
      fileName,
    }: {
      fields: CreatePhotoNoteFields;
      image: UploadFile;
      fileName: string;
    }): Promise<Note> => {
      try {
        return await createPhotoNote(tripId, fields, image, fileName);
      } catch (e) {
        if (!isOfflineError(e)) throw e;
        const tempId = await enqueueMediaNote(tripId, 'Photo', fields, image, fileName);
        return buildOptimisticMediaNote(tripId, tempId, 'Photo', fields);
      }
    },
    onSuccess: (note) => {
      if (!note.pendingSync) queryClient.invalidateQueries({ queryKey: tripNotesQueryKey(tripId) });
    },
  });
}

export function useDeleteNoteMutation(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (noteId: string): Promise<{ offline: boolean; noteId: string }> => {
      // A note that only exists offline (temp id) must never hit the API.
      if (isTempNoteId(noteId)) {
        await enqueueNoteDelete(tripId, noteId);
        return { offline: true, noteId };
      }
      try {
        await deleteNote(noteId);
        return { offline: false, noteId };
      } catch (e) {
        if (!isOfflineError(e)) throw e;
        await enqueueNoteDelete(tripId, noteId);
        return { offline: true, noteId };
      }
    },
    onSuccess: ({ offline }) => {
      if (!offline) queryClient.invalidateQueries({ queryKey: tripNotesQueryKey(tripId) });
    },
  });
}

export function useUpdateNoteMutation(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId, bodyText }: { noteId: string; bodyText: string }) => {
      if (isTempNoteId(noteId)) {
        await enqueueNoteUpdate(tripId, noteId, bodyText);
        return { offline: true, noteId, bodyText };
      }
      try {
        await updateNote(noteId, bodyText);
        return { offline: false, noteId, bodyText };
      } catch (e) {
        if (!isOfflineError(e)) throw e;
        await enqueueNoteUpdate(tripId, noteId, bodyText);
        return { offline: true, noteId, bodyText };
      }
    },
    onSuccess: ({ offline }) => {
      if (!offline) queryClient.invalidateQueries({ queryKey: tripNotesQueryKey(tripId) });
    },
  });
}
