import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AiDock } from './AiDock';
import { useUiStore } from '../store/uiStore';
import { useAiBatchStore } from '../store/aiBatchStore';

jest.mock('../queries/ai', () => ({
  useAiStatusQuery: jest.fn(),
}));
jest.mock('../api', () => ({
  undoAiBatch: jest.fn().mockResolvedValue([]),
}));

import { useAiStatusQuery } from '../queries/ai';

const mockStatus = (status: { enabled: boolean } | undefined, isLoading = false) => {
  (useAiStatusQuery as jest.Mock).mockReturnValue({ data: status, isLoading });
};

const renderDock = (tripId = 'trip-1') => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AiDock tripId={tripId} />
    </QueryClientProvider>,
  );
};

describe('AiDock', () => {
  beforeEach(() => {
    useUiStore.setState({ tab: 'trips', openTripId: 'trip-1', pendingAiPrompt: null });
    useAiBatchStore.setState({ lastByTrip: {} });
  });

  it('shows a passive off state when AI is not configured', () => {
    mockStatus({ enabled: false });
    const { queryByLabelText, getByText } = renderDock();
    expect(getByText(/AI is off on this server/)).toBeTruthy();
    expect(queryByLabelText('Ask Wander about this trip')).toBeNull();
  });

  it('sends the typed prompt to the assistant tab for the open trip', () => {
    mockStatus({ enabled: true });
    const { getByLabelText } = renderDock();
    fireEvent.changeText(getByLabelText('Ask Wander about this trip'), 'Add a food market');
    fireEvent.press(getByLabelText('Send to Wander assistant'));

    const s = useUiStore.getState();
    expect(s.tab).toBe('assistant');
    expect(s.pendingAiPrompt).toBe('Add a food market');
    expect(s.openTripId).toBe('trip-1');
  });

  it('opens the assistant with no prompt when tapped empty', () => {
    mockStatus({ enabled: true });
    const { getByLabelText } = renderDock();
    fireEvent.press(getByLabelText('Open Wander assistant for this trip'));

    const s = useUiStore.getState();
    expect(s.tab).toBe('assistant');
    expect(s.pendingAiPrompt).toBeNull();
  });

  it('shows Undo AI when a live chat batch exists for this trip', () => {
    mockStatus({ enabled: true });
    useAiBatchStore.setState({
      lastByTrip: {
        'trip-1': {
          batchId: 'b1',
          tripId: 'trip-1',
          changes: [],
          undoSteps: [{ kind: 'deleteItem', itemId: 'i1' }],
          undone: false,
        },
      },
    });
    const { getByLabelText } = renderDock();
    expect(getByLabelText('Undo last AI change')).toBeTruthy();
  });

  it('hides Undo AI once the batch is undone', () => {
    mockStatus({ enabled: true });
    useAiBatchStore.setState({
      lastByTrip: {
        'trip-1': {
          batchId: 'b1',
          tripId: 'trip-1',
          changes: [],
          undoSteps: [{ kind: 'deleteItem', itemId: 'i1' }],
          undone: true,
        },
      },
    });
    const { queryByLabelText } = renderDock();
    expect(queryByLabelText('Undo last AI change')).toBeNull();
  });
});
