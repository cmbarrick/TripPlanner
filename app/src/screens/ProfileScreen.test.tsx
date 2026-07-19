import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileScreen } from './ProfileScreen';
import { AuthState } from '../auth/session';

jest.mock('../api', () => ({
  deleteAccount: jest.fn(),
}));
jest.mock('../queries/preferences', () => ({
  ...jest.requireActual('../queries/preferences'),
  usePreferencesQuery: jest.fn().mockReturnValue({ data: undefined, isLoading: false }),
  useUpdatePreferencesMutation: jest.fn().mockReturnValue({ mutate: jest.fn() }),
}));

import { deleteAccount } from '../api';

const entraAuth: AuthState = {
  mode: 'entra',
  isAuthenticated: true,
  subject: 'sub-123',
  email: 'traveler@example.com',
  displayName: 'Traveler',
  accessToken: 'token',
  expiresAtUnixSeconds: null,
};

const guestAuth: AuthState = {
  mode: 'none',
  isAuthenticated: false,
  subject: null,
  email: null,
  displayName: null,
  accessToken: null,
  expiresAtUnixSeconds: null,
};

function renderProfile(auth: AuthState, onSignOut = jest.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <ProfileScreen
        unit="F"
        onChangeUnit={jest.fn()}
        clock="12h"
        onChangeClock={jest.fn()}
        auth={auth}
        authLoading={false}
        authBusy={false}
        entraConfigured
        authError={null}
        onSignIn={jest.fn()}
        onSignOut={onSignOut}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onSignOut };
}

describe('ProfileScreen — account deletion', () => {
  beforeEach(() => {
    (deleteAccount as jest.Mock).mockReset().mockResolvedValue(undefined);
  });

  it('does not show the danger zone when not signed in', () => {
    const { queryByText } = renderProfile(guestAuth);
    expect(queryByText('Delete account')).toBeNull();
  });

  it('shows a confirm step before actually deleting', () => {
    const { getByLabelText, getByText, queryByText } = renderProfile(entraAuth);

    expect(queryByText(/permanently deleted/)).toBeNull();
    fireEvent.press(getByLabelText('Delete account'));
    expect(getByText(/Are you sure/)).toBeTruthy();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('cancel dismisses the confirm step without deleting', () => {
    const { getByLabelText, getByText, queryByText } = renderProfile(entraAuth);

    fireEvent.press(getByLabelText('Delete account'));
    fireEvent.press(getByText('Cancel'));

    expect(queryByText(/Are you sure/)).toBeNull();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('confirming calls deleteAccount and signs out on success', async () => {
    const { getByLabelText, onSignOut } = renderProfile(entraAuth);

    fireEvent.press(getByLabelText('Delete account'));
    fireEvent.press(getByLabelText('Confirm delete account'));

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1));
  });
});
