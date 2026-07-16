import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTripReactions, toggleReaction } from '../api';
import { Reaction, ReactionTargetType } from '../types';
import { getAuthStateSnapshot } from '../auth/session';

export const tripReactionsQueryKey = (tripId: string) => ['reactions', tripId] as const;

/** All reactions across a trip (trip/item/recap targets). Realtime `useTripRealtime` invalidates
 *  this key on peers' toggles, so it stays live without polling. */
export function useTripReactionsQuery(tripId: string) {
  return useQuery({
    queryKey: tripReactionsQueryKey(tripId),
    queryFn: () => getTripReactions(tripId),
    staleTime: 1000 * 15,
  });
}

/** Toggles the caller's emoji on a target, applied optimistically so the tap feels instant. */
export function useToggleReactionMutation(tripId: string) {
  const qc = useQueryClient();
  const ownerId = getAuthStateSnapshot().subject ?? '';

  return useMutation({
    mutationFn: ({ targetType, targetId, emoji }: { targetType: ReactionTargetType; targetId: string; emoji: string }) =>
      toggleReaction(tripId, targetType, targetId, emoji),
    onMutate: async ({ targetType, targetId, emoji }) => {
      await qc.cancelQueries({ queryKey: tripReactionsQueryKey(tripId) });
      const previous = qc.getQueryData<Reaction[]>(tripReactionsQueryKey(tripId));

      qc.setQueryData<Reaction[]>(tripReactionsQueryKey(tripId), (old = []) => {
        const mine = old.find(
          (r) => r.targetType === targetType && r.targetId === targetId && r.emoji === emoji && r.ownerId === ownerId,
        );
        if (mine) return old.filter((r) => r.id !== mine.id);
        const optimistic: Reaction = {
          id: `optimistic-${targetType}-${targetId}-${emoji}`,
          targetType,
          targetId,
          emoji,
          ownerId,
          createdAt: new Date().toISOString(),
        };
        return [...old, optimistic];
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(tripReactionsQueryKey(tripId), context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: tripReactionsQueryKey(tripId) }),
  });
}
