import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchRecaps,
  generateRecap,
  updateRecap,
  finalizeRecap,
  shareRecap,
  deleteRecap,
  GenerateRecapInput,
} from '../api';
import { aiStatusQueryKey } from './ai';

export const recapsQueryKey = (tripId: string) => ['recaps', tripId] as const;

export function useRecapsQuery(tripId: string) {
  return useQuery({
    queryKey: recapsQueryKey(tripId),
    queryFn: () => fetchRecaps(tripId),
    staleTime: 30_000,
  });
}

export function useGenerateRecapMutation(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateRecapInput) => generateRecap(tripId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recapsQueryKey(tripId) });
      qc.invalidateQueries({ queryKey: aiStatusQueryKey });
    },
  });
}

export function useUpdateRecapMutation(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recapId, title, body }: { recapId: string; title: string; body: string }) =>
      updateRecap(tripId, recapId, { title, body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: recapsQueryKey(tripId) }),
  });
}

export function useFinalizeRecapMutation(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recapId: string) => finalizeRecap(tripId, recapId),
    onSuccess: () => qc.invalidateQueries({ queryKey: recapsQueryKey(tripId) }),
  });
}

export function useShareRecapMutation(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recapId: string) => shareRecap(tripId, recapId),
    onSuccess: () => qc.invalidateQueries({ queryKey: recapsQueryKey(tripId) }),
  });
}

export function useDeleteRecapMutation(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recapId: string) => deleteRecap(tripId, recapId),
    onSuccess: () => qc.invalidateQueries({ queryKey: recapsQueryKey(tripId) }),
  });
}
