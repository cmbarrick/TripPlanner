import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
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
import { Note } from '../types';
import { enqueueNoteCreate, enqueueNoteUpdate, enqueueNoteDelete, isTempNoteId } from '../sync/outbox';

export const tripNotesQueryKey = (tripId: string) => ['notes', tripId] as const;

type NotesCache = { data: Note[]; live: boolean };

/** Surgically updates the cached notes list (offline-first paths edit the cache directly so the
 *  optimistic entry shows immediately, without a server round-trip). */
function patchNotesCache(qc: QueryClient, tripId: string, updater: (notes: Note[]) => Note[]) {
  qc.setQueryData<NotesCache>(tripNotesQueryKey(tripId), (old) => ({
    data: updater(old?.data ?? []),
    live: old?.live ?? false,
  }));
}

/** Builds the placeholder note rendered while a queued create awaits sync. */
function buildOptimisticNote(tripId: string, tempId: string, input: CreateNoteInput): Note {
  const now = new Date().toISOString();
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
    createdAt: now,
    updatedAt: now,
    pendingSync: true,
  };
}

/** All notes for a trip (newest first). Used for the per-event "has notes" indicator and the
 *  event journal section. Short stale time so newly added notes show up promptly. */
export function useTripNotesQuery(tripId: string) {
  return useQuery({
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
    onSuccess: (note) => {
      if (note.pendingSync) {
        patchNotesCache(queryClient, tripId, (notes) => [note, ...notes]);
      } else {
        queryClient.invalidateQueries({ queryKey: tripNotesQueryKey(tripId) });
      }
    },
  });
}

export function useCreateVoiceNoteMutation(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fields, audio, fileName }: { fields: CreateVoiceNoteFields; audio: UploadFile; fileName: string }) =>
      createVoiceNote(tripId, fields, audio, fileName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tripNotesQueryKey(tripId) }),
  });
}

export function useCreatePhotoNoteMutation(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fields, image, fileName }: { fields: CreatePhotoNoteFields; image: UploadFile; fileName: string }) =>
      createPhotoNote(tripId, fields, image, fileName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tripNotesQueryKey(tripId) }),
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
    onSuccess: ({ offline, noteId }) => {
      if (offline) {
        patchNotesCache(queryClient, tripId, (notes) => notes.filter((n) => n.id !== noteId));
      } else {
        queryClient.invalidateQueries({ queryKey: tripNotesQueryKey(tripId) });
      }
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
    onSuccess: ({ offline, noteId, bodyText }) => {
      if (offline) {
        patchNotesCache(queryClient, tripId, (notes) =>
          notes.map((n) =>
            n.id === noteId
              ? { ...n, bodyText, pendingSync: true, updatedAt: new Date().toISOString() }
              : n,
          ),
        );
      } else {
        queryClient.invalidateQueries({ queryKey: tripNotesQueryKey(tripId) });
      }
    },
  });
}
