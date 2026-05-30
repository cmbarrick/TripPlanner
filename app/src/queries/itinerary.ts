import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ItineraryItemInput,
  addPackingItem,
  createItem,
  createWishlistItem,
  deleteItem,
  deletePackingItem,
  moveItem,
  reorderBacklog,
  reorderDayItems,
  setItemStatus,
  setPackingItemPacked,
  updateItem,
} from '../api';
import { ItineraryItemStatus } from '../types';
import { tripsQueryKey } from './trips';

/** Mutations all refetch the trips tree so the planner, calendar, and packing stay in sync. */
function useTripsInvalidation() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: tripsQueryKey });
}

export function useCreateItemMutation() {
  const invalidate = useTripsInvalidation();
  return useMutation({
    mutationFn: ({ tripId, dayId, input }: { tripId: string; dayId: string; input: ItineraryItemInput }) =>
      createItem(tripId, dayId, input),
    onSuccess: invalidate,
  });
}

export function useCreateWishlistItemMutation() {
  const invalidate = useTripsInvalidation();
  return useMutation({
    mutationFn: ({ tripId, input }: { tripId: string; input: ItineraryItemInput }) =>
      createWishlistItem(tripId, input),
    onSuccess: invalidate,
  });
}

export function useSetItemStatusMutation() {
  const invalidate = useTripsInvalidation();
  return useMutation({
    mutationFn: ({ tripId, itemId, status }: { tripId: string; itemId: string; status: ItineraryItemStatus }) =>
      setItemStatus(tripId, itemId, status),
    onSuccess: invalidate,
  });
}

export function useReorderBacklogMutation() {
  const invalidate = useTripsInvalidation();
  return useMutation({
    mutationFn: ({ tripId, itemIds }: { tripId: string; itemIds: string[] }) =>
      reorderBacklog(tripId, itemIds),
    onSuccess: invalidate,
  });
}

export function useUpdateItemMutation() {
  const invalidate = useTripsInvalidation();
  return useMutation({
    mutationFn: ({ tripId, itemId, input }: { tripId: string; itemId: string; input: ItineraryItemInput }) =>
      updateItem(tripId, itemId, input),
    onSuccess: invalidate,
  });
}

export function useDeleteItemMutation() {
  const invalidate = useTripsInvalidation();
  return useMutation({
    mutationFn: ({ tripId, itemId }: { tripId: string; itemId: string }) => deleteItem(tripId, itemId),
    onSuccess: invalidate,
  });
}

export function useReorderDayItemsMutation() {
  const invalidate = useTripsInvalidation();
  return useMutation({
    mutationFn: ({ tripId, dayId, itemIds }: { tripId: string; dayId: string; itemIds: string[] }) =>
      reorderDayItems(tripId, dayId, itemIds),
    onSuccess: invalidate,
  });
}

export function useMoveItemMutation() {
  const invalidate = useTripsInvalidation();
  return useMutation({
    mutationFn: ({ tripId, itemId, targetDayId }: { tripId: string; itemId: string; targetDayId: string | null }) =>
      moveItem(tripId, itemId, targetDayId),
    onSuccess: invalidate,
  });
}

export function useAddPackingMutation() {
  const invalidate = useTripsInvalidation();
  return useMutation({
    mutationFn: ({ tripId, name }: { tripId: string; name: string }) => addPackingItem(tripId, name),
    onSuccess: invalidate,
  });
}

export function useTogglePackingMutation() {
  const invalidate = useTripsInvalidation();
  return useMutation({
    mutationFn: ({ tripId, packingItemId, isPacked }: { tripId: string; packingItemId: string; isPacked: boolean }) =>
      setPackingItemPacked(tripId, packingItemId, isPacked),
    onSuccess: invalidate,
  });
}

export function useDeletePackingMutation() {
  const invalidate = useTripsInvalidation();
  return useMutation({
    mutationFn: ({ tripId, packingItemId }: { tripId: string; packingItemId: string }) =>
      deletePackingItem(tripId, packingItemId),
    onSuccess: invalidate,
  });
}
