import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAiStatus, generateItineraryDraft } from '../api';

export const aiStatusQueryKey = ['ai', 'status'] as const;

export function useAiStatusQuery() {
  return useQuery({
    queryKey: aiStatusQueryKey,
    queryFn: fetchAiStatus,
    staleTime: 60_000,
  });
}

export function useGenerateItineraryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, prompt }: { tripId: string; prompt: string }) =>
      generateItineraryDraft(tripId, prompt),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: aiStatusQueryKey });
    },
  });
}
