import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecapPanel } from './RecapPanel';
import { Trip } from '../types';

jest.mock('../queries/ai', () => ({
  aiStatusQueryKey: ['ai', 'status'],
  useAiStatusQuery: jest.fn(),
}));
jest.mock('../api', () => ({
  fetchRecaps: jest.fn(),
  generateRecap: jest.fn(),
  updateRecap: jest.fn(),
  finalizeRecap: jest.fn(),
  shareRecap: jest.fn(),
  deleteRecap: jest.fn(),
  recapShareAbsoluteUrl: (u: string) => `http://localhost:5064${u}`,
  downloadRecapPdf: jest.fn(),
}));

import { useAiStatusQuery } from '../queries/ai';
import { fetchRecaps, generateRecap } from '../api';

const trip = {
  id: 'trip-1',
  title: 'Sicily',
  destination: 'Sicily, Italy',
  startDate: '2026-05-01',
  endDate: '2026-05-03',
  currency: 'EUR',
  days: [
    { id: 'day-1', dayNumber: 1, date: '2026-05-01', items: [] },
    { id: 'day-2', dayNumber: 2, date: '2026-05-02', items: [] },
  ],
  unscheduledItems: [],
} as unknown as Trip;

const sampleRecap = {
  id: 'recap-1',
  tripId: 'trip-1',
  scope: 'Trip',
  targetId: null,
  tone: 'Narrative',
  title: 'A sicilian week',
  body: '## Day 1\n\nWe swam.',
  sections: [{ heading: 'Day 1', body: 'We swam.', noteIds: ['n-1', 'n-2'] }],
  generatedFromNoteIds: ['n-1', 'n-2'],
  status: 'Draft',
  version: 1,
  shareUrl: null,
  exportUrls: [],
  tokensUsed: 100,
  createdAt: '2026-05-09T10:00:00Z',
  updatedAt: '2026-05-09T10:00:00Z',
};

const renderPanel = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RecapPanel trip={trip} selectedDayId="day-2" />
    </QueryClientProvider>,
  );
};

describe('RecapPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchRecaps as jest.Mock).mockResolvedValue({ data: [], live: true });
  });

  it('shows a graceful off state when AI is disabled', async () => {
    (useAiStatusQuery as jest.Mock).mockReturnValue({ data: { enabled: false }, isLoading: false });
    const { findByText, queryByLabelText } = renderPanel();
    expect(await findByText(/AI is off on this server/)).toBeTruthy();
    expect(queryByLabelText('Generate recap')).toBeNull();
  });

  it('generates with the picked scope and tone', async () => {
    (useAiStatusQuery as jest.Mock).mockReturnValue({ data: { enabled: true }, isLoading: false });
    (generateRecap as jest.Mock).mockResolvedValue(sampleRecap);
    const { getByLabelText } = renderPanel();

    fireEvent.press(getByLabelText('Single day'));
    fireEvent.press(getByLabelText('Day 2'));
    fireEvent.press(getByLabelText('Highlights'));
    fireEvent.press(getByLabelText('Generate recap'));

    await waitFor(() =>
      expect(generateRecap).toHaveBeenCalledWith('trip-1', {
        scope: 'Day',
        targetId: 'day-2',
        tone: 'Highlights',
      }),
    );
  });

  it('lists recaps with grounding metadata and section citations', async () => {
    (useAiStatusQuery as jest.Mock).mockReturnValue({ data: { enabled: true }, isLoading: false });
    (fetchRecaps as jest.Mock).mockResolvedValue({ data: [sampleRecap], live: true });
    const { findByText, getByLabelText } = renderPanel();

    expect(await findByText('A sicilian week')).toBeTruthy();
    expect(await findByText(/grounded in 2 journal entries/)).toBeTruthy();

    fireEvent.press(getByLabelText('Open recap A sicilian week'));
    expect(await findByText(/Day 1 — from 2 notes/)).toBeTruthy();
    expect(getByLabelText('Recap body').props.value).toContain('We swam.');
  });
});
