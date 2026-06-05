import { useQuery } from '@tanstack/react-query';
import {
  fetchTripWeather,
  fetchItemHourlyWeather,
  TripWeatherResponse,
  ItemWeather,
  DayWeather,
  ItemHourlyWeather,
  HourlyWeatherPoint,
} from '../api';

export { ItemWeather, DayWeather, TripWeatherResponse, ItemHourlyWeather, HourlyWeatherPoint };

export const weatherQueryKey = (tripId: string) => ['weather', tripId] as const;

export function useWeatherQuery(tripId: string) {
  return useQuery({
    queryKey: weatherQueryKey(tripId),
    queryFn: () => fetchTripWeather(tripId),
    // Weather changes slowly; keep cached for 1 hour before refetching.
    staleTime: 1000 * 60 * 60,
    // If the trip has no located items the API returns empty arrays — that's a valid
    // result, not an error, so we don't retry on failure.
    retry: 1,
  });
}

export const hourlyWeatherQueryKey = (tripId: string, itemId: string) =>
  ['weather', tripId, 'hourly', itemId] as const;

export function useItemHourlyWeatherQuery(tripId: string, itemId: string, enabled: boolean) {
  return useQuery({
    queryKey: hourlyWeatherQueryKey(tripId, itemId),
    queryFn: () => fetchItemHourlyWeather(tripId, itemId),
    enabled,
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });
}
