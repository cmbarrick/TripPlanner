import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createTrip,
  deleteTrip,
  getTrips,
  updateTrip,
  TripInput,
} from '../api';
import { Trip } from '../types';

export const tripsQueryKey = ['trips'] as const;

type TripsCache = { data: Trip[]; live: boolean };

export function useTripsQuery() {
  return useQuery({
    queryKey: tripsQueryKey,
    queryFn: getTrips,
  });
}

export function useCreateTripMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TripInput) => createTrip(input),
    onSuccess: (created) => {
      queryClient.setQueryData<TripsCache>(tripsQueryKey, (current) =>
        current ? { ...current, data: [...current.data, created] } : current
      );
      queryClient.invalidateQueries({ queryKey: tripsQueryKey });
    },
  });
}

export function useUpdateTripMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TripInput }) => updateTrip(id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData<TripsCache>(tripsQueryKey, (current) =>
        current
          ? { ...current, data: current.data.map((t) => (t.id === updated.id ? updated : t)) }
          : current
      );
      queryClient.invalidateQueries({ queryKey: tripsQueryKey });
    },
  });
}

export function useDeleteTripMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTrip(id),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<TripsCache>(tripsQueryKey, (current) =>
        current ? { ...current, data: current.data.filter((t) => t.id !== id) } : current
      );
      queryClient.invalidateQueries({ queryKey: tripsQueryKey });
    },
  });
}
