import { useQuery } from '@tanstack/react-query';
import { fetchAiStatus } from '../api';

export const aiStatusQueryKey = ['ai', 'status'] as const;

export function useAiStatusQuery() {
  return useQuery({
    queryKey: aiStatusQueryKey,
    queryFn: fetchAiStatus,
    staleTime: 60_000,
  });
}
