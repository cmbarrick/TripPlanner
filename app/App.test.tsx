import React from 'react';
import { render, screen } from '@testing-library/react-native';
import App from './App';
import { useUiStore } from './src/store/uiStore';

jest.mock('./src/queries/trips', () => {
  const stub = () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false, error: null });
  return {
    tripsQueryKey: ['trips'],
    useTripsQuery: () => ({
      isLoading: false,
      isError: false,
      data: { data: [], live: true },
    }),
    useCreateTripMutation: stub,
    useUpdateTripMutation: stub,
    useDeleteTripMutation: stub,
  };
});

jest.mock('./src/queries/itinerary', () => {
  const stub = () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false, error: null });
  return {
    useCreateItemMutation: stub,
    useCreateWishlistItemMutation: stub,
    useUpdateItemMutation: stub,
    useDeleteItemMutation: stub,
    useSetItemStatusMutation: stub,
    useReorderDayItemsMutation: stub,
    useReorderBacklogMutation: stub,
    useMoveItemMutation: stub,
    useAddPackingMutation: stub,
    useTogglePackingMutation: stub,
    useDeletePackingMutation: stub,
  };
});

jest.mock('./src/queries/ai', () => ({
  aiStatusQueryKey: ['ai', 'status'],
  useAiStatusQuery: () => ({
    isLoading: false,
    data: {
      enabled: false,
      dailyTokenLimit: 50_000,
      tokensUsedToday: 0,
      tokensRemainingToday: 50_000,
    },
  }),
  useGenerateItineraryMutation: () => ({ mutate: jest.fn(), isPending: false, error: null }),
}));

jest.mock('./src/queries/preferences', () => ({
  usePreferencesQuery: () => ({
    isLoading: false,
    data: {
      data: {
        temperatureUnit: 'F',
        distanceUnit: 'mi',
        currency: 'USD',
        travelStyle: null,
        pace: null,
        diet: null,
        budgetBand: null,
      },
      live: false,
    },
  }),
  useUpdatePreferencesMutation: () => ({ mutate: jest.fn(), isPending: false }),
  TRAVEL_STYLE_OPTIONS: [],
  PACE_OPTIONS: [],
  DIET_OPTIONS: [],
  BUDGET_OPTIONS: [],
}));

jest.mock('./src/auth/useAuthSession', () => ({
  useAuthSession: () => ({
    auth: {
      mode: 'dev-bypass',
      isAuthenticated: true,
      subject: 'local-dev-user',
      email: 'local-dev-user@local.dev',
      displayName: 'Local Dev User',
      accessToken: null,
      expiresAtUnixSeconds: null,
    },
    loading: false,
    busy: false,
    error: null,
    entraConfigured: false,
    signIn: jest.fn(),
    signOut: jest.fn(),
  }),
}));

describe('App smoke test', () => {
  beforeEach(() => {
    useUiStore.setState({
      tab: 'trips',
      tripView: 'list',
      openTripId: null,
      unit: 'F',
    });
  });

  it('renders My Trips screen', () => {
    render(<App />);

    expect(screen.getByText('My Trips')).toBeTruthy();
    expect(screen.getByText('0 upcoming · 0 past')).toBeTruthy();
  });
});
