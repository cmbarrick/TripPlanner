import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchPreferences,
  updatePreferences,
  UserPreferencesPatch,
} from '../api';

export const preferencesQueryKey = ['preferences'] as const;

export function usePreferencesQuery(enabled = true) {
  return useQuery({
    queryKey: preferencesQueryKey,
    queryFn: fetchPreferences,
    enabled,
    staleTime: 30_000,
  });
}

export function useUpdatePreferencesMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UserPreferencesPatch) => updatePreferences(patch),
    onSuccess: (data) => {
      qc.setQueryData(preferencesQueryKey, { data, live: true });
    },
  });
}

export const TRAVEL_STYLE_OPTIONS = [
  { value: 'adventure' as const, label: 'Adventure' },
  { value: 'culture' as const, label: 'Culture' },
  { value: 'foodie' as const, label: 'Foodie' },
  { value: 'relaxation' as const, label: 'Relax' },
  { value: 'mixed' as const, label: 'Mixed' },
];

export const PACE_OPTIONS = [
  { value: 'relaxed' as const, label: 'Relaxed' },
  { value: 'moderate' as const, label: 'Moderate' },
  { value: 'packed' as const, label: 'Packed' },
];

export const DIET_OPTIONS = [
  { value: 'none' as const, label: 'None' },
  { value: 'vegetarian' as const, label: 'Veg' },
  { value: 'vegan' as const, label: 'Vegan' },
  { value: 'gluten_free' as const, label: 'GF' },
  { value: 'halal' as const, label: 'Halal' },
  { value: 'kosher' as const, label: 'Kosher' },
];

export const BUDGET_OPTIONS = [
  { value: 'budget' as const, label: 'Budget' },
  { value: 'mid' as const, label: 'Mid' },
  { value: 'luxury' as const, label: 'Luxury' },
];
