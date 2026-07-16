import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  publishRecap,
  getPublishStatus,
  unpublishRecap,
  searchDiscovery,
  askDiscovery,
  reportPublicRecap,
  getModerationQueue,
  approveModerationItem,
  rejectModerationItem,
  PublishRecapInput,
  SearchDiscoveryInput,
} from '../api';

export const publishStatusQueryKey = (tripId: string, recapId: string) =>
  ['recap-publish-status', tripId, recapId] as const;

export function usePublishStatusQuery(tripId: string, recapId: string, enabled = true) {
  return useQuery({
    queryKey: publishStatusQueryKey(tripId, recapId),
    queryFn: () => getPublishStatus(tripId, recapId),
    enabled,
  });
}

export function usePublishRecapMutation(tripId: string, recapId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PublishRecapInput) => publishRecap(tripId, recapId, input),
    onSuccess: (view) => qc.setQueryData(publishStatusQueryKey(tripId, recapId), view),
  });
}

export function useUnpublishRecapMutation(tripId: string, recapId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unpublishRecap(tripId, recapId),
    onSuccess: () => qc.setQueryData(publishStatusQueryKey(tripId, recapId), null),
  });
}

export const discoverySearchQueryKey = (input: SearchDiscoveryInput) =>
  ['discovery-search', input] as const;

export function useDiscoverySearchQuery(input: SearchDiscoveryInput, enabled = true) {
  return useQuery({
    queryKey: discoverySearchQueryKey(input),
    queryFn: () => searchDiscovery(input),
    enabled,
  });
}

export function useAskDiscoveryMutation() {
  return useMutation({ mutationFn: (question: string) => askDiscovery(question) });
}

export function useReportRecapMutation() {
  return useMutation({
    mutationFn: ({ publicRecapId, reason }: { publicRecapId: string; reason: string }) =>
      reportPublicRecap(publicRecapId, reason),
  });
}

export const moderationQueueQueryKey = ['moderation-queue'] as const;

export function useModerationQueueQuery(enabled = true) {
  return useQuery({
    queryKey: moderationQueueQueryKey,
    queryFn: getModerationQueue,
    enabled,
    retry: false,
  });
}

export function useApproveModerationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (publicRecapId: string) => approveModerationItem(publicRecapId),
    onSuccess: () => qc.invalidateQueries({ queryKey: moderationQueueQueryKey }),
  });
}

export function useRejectModerationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ publicRecapId, reason }: { publicRecapId: string; reason: string }) =>
      rejectModerationItem(publicRecapId, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: moderationQueueQueryKey }),
  });
}
