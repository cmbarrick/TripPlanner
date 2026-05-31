import { useQuery } from '@tanstack/react-query';
import { fetchTravelTimes, TravelSegment, TravelTimesResponse } from '../api';

export { TravelSegment, TravelTimesResponse };

export const travelTimesQueryKey = (tripId: string) => ['travel-times', tripId] as const;

export function useTravelTimesQuery(tripId: string) {
  return useQuery({
    queryKey: travelTimesQueryKey(tripId),
    queryFn: () => fetchTravelTimes(tripId),
    staleTime: 1000 * 60 * 10, // 10 min — distance between stops doesn't change often
    retry: 1,
  });
}
