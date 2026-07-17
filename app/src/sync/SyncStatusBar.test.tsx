import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SyncStatusBar } from './SyncStatusBar';

const mockUseSyncStatus = jest.fn();
jest.mock('./useOutboxSync', () => ({
  useSyncStatus: () => mockUseSyncStatus(),
}));

describe('SyncStatusBar', () => {
  it('renders nothing when nothing is queued', () => {
    mockUseSyncStatus.mockReturnValue({ pendingCount: 0, blocked: false, retryNow: jest.fn() });
    const { queryByLabelText } = render(<SyncStatusBar />);
    expect(queryByLabelText('Sync status')).toBeNull();
  });

  it('shows a soft pending state when queued but not blocked', () => {
    mockUseSyncStatus.mockReturnValue({ pendingCount: 2, blocked: false, retryNow: jest.fn() });
    const { getByText } = render(<SyncStatusBar />);
    expect(getByText('⏳ 2 changes waiting to sync')).toBeTruthy();
  });

  it('shows an offline state when blocked, singular wording for one change', () => {
    mockUseSyncStatus.mockReturnValue({ pendingCount: 1, blocked: true, retryNow: jest.fn() });
    const { getByText } = render(<SyncStatusBar />);
    expect(getByText('🔌 Offline — 1 change waiting to sync')).toBeTruthy();
  });

  it('calls retryNow when the retry action is pressed', async () => {
    const retryNow = jest.fn().mockResolvedValue(1);
    mockUseSyncStatus.mockReturnValue({ pendingCount: 1, blocked: true, retryNow });
    const { getByLabelText } = render(<SyncStatusBar />);

    fireEvent.press(getByLabelText('Retry sync now'));

    await waitFor(() => expect(retryNow).toHaveBeenCalledTimes(1));
  });
});
