import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createNote,
  createPhotoNote,
  createVoiceNote,
  deleteNote,
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
    queryFn: () => getTripNotes(tripId),
    staleTime: 1000 * 30,
    retry: 1,
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
