import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createNote,
  createPhotoNote,
  createVoiceNote,
  deleteNote,
  updateNote,
  getTripNotes,
  CreateNoteInput,
  CreatePhotoNoteFields,
  CreateVoiceNoteFields,
  UploadFile,
} from '../api';

export const tripNotesQueryKey = (tripId: string) => ['notes', tripId] as const;

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
  });
}

export function useCreateNoteMutation(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNoteInput) => createNote(tripId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tripNotesQueryKey(tripId) }),
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
    mutationFn: (noteId: string) => deleteNote(noteId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tripNotesQueryKey(tripId) }),
  });
}

export function useUpdateNoteMutation(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId, bodyText }: { noteId: string; bodyText: string }) =>
      updateNote(noteId, bodyText),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tripNotesQueryKey(tripId) }),
  });
}
