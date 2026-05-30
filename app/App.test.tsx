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
    useUpdateItemMutation: stub,
    useDeleteItemMutation: stub,
    useReorderDayItemsMutation: stub,
    useMoveItemMutation: stub,
    useAddPackingMutation: stub,
    useTogglePackingMutation: stub,
    useDeletePackingMutation: stub,
  };
});

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
