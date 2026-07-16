import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DiscoverScreen } from './DiscoverScreen';

jest.mock('../api', () => ({
  searchDiscovery: jest.fn(),
  askDiscovery: jest.fn(),
  reportPublicRecap: jest.fn(),
}));

import { searchDiscovery, askDiscovery, reportPublicRecap } from '../api';

const sampleResult = {
  publicRecapId: 'pr-1',
  recapId: 'recap-1',
  tripId: 'trip-1',
  title: 'A week in the Alps',
  snippet: 'We skied every morning and warmed up with fondue.',
  places: ['Zermatt'],
  tags: ['skiing'],
  season: 'Winter',
  budgetBand: 'mid',
  publishedAt: '2026-06-01T00:00:00Z',
  relevance: 0.8,
};

const renderScreen = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DiscoverScreen />
    </QueryClientProvider>,
  );
};

describe('DiscoverScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (searchDiscovery as jest.Mock).mockResolvedValue([]);
  });

  it('runs a search and lists results', async () => {
    (searchDiscovery as jest.Mock).mockResolvedValue([sampleResult]);
    const { getByLabelText, findByText } = renderScreen();

    fireEvent.changeText(getByLabelText('Search text'), 'skiing');
    fireEvent.press(getByLabelText('Run search'));

    await waitFor(() =>
      expect(searchDiscovery).toHaveBeenCalledWith({
        q: 'skiing',
        place: undefined,
        season: undefined,
        budgetBand: undefined,
      }),
    );
    expect(await findByText('A week in the Alps')).toBeTruthy();
  });

  it('reports a result with a reason', async () => {
    (searchDiscovery as jest.Mock).mockResolvedValue([sampleResult]);
    (reportPublicRecap as jest.Mock).mockResolvedValue(undefined);
    const { getByLabelText, findByText } = renderScreen();

    fireEvent.press(getByLabelText('Run search'));
    await findByText('A week in the Alps');

    fireEvent.press(getByLabelText('Report this recap'));
    fireEvent.changeText(getByLabelText('Report reason'), 'Contains someone else’s address');
    fireEvent.press(getByLabelText('Submit report'));

    await waitFor(() =>
      expect(reportPublicRecap).toHaveBeenCalledWith('pr-1', 'Contains someone else’s address'),
    );
    expect(await findByText(/Reported/)).toBeTruthy();
  });

  it('asks the discovery assistant and shows a grounded answer with citations', async () => {
    (askDiscovery as jest.Mock).mockResolvedValue({
      hasAnswer: true,
      answer: 'Skiing in the Alps is best in winter, per one traveler.',
      citations: [{ publicRecapId: 'pr-1', recapId: 'recap-1', tripId: 'trip-1', title: 'A week in the Alps', places: ['Zermatt'] }],
    });
    const { getByLabelText, findByText } = renderScreen();

    fireEvent.press(getByLabelText('Ask AI'));
    fireEvent.changeText(getByLabelText('Discovery question'), 'What is skiing like in the Alps?');
    fireEvent.press(getByLabelText('Ask'));

    await waitFor(() => expect(askDiscovery).toHaveBeenCalledWith('What is skiing like in the Alps?'));
    expect(await findByText(/Skiing in the Alps is best in winter/)).toBeTruthy();
    expect(await findByText(/A week in the Alps/)).toBeTruthy();
  });

  it('shows a refusal message when the assistant has no answer', async () => {
    (askDiscovery as jest.Mock).mockResolvedValue({ hasAnswer: false, answer: null, citations: [] });
    const { getByLabelText, findByText } = renderScreen();

    fireEvent.press(getByLabelText('Ask AI'));
    fireEvent.changeText(getByLabelText('Discovery question'), 'Anything about Antarctica?');
    fireEvent.press(getByLabelText('Ask'));

    expect(await findByText(/No public recap answers that yet/)).toBeTruthy();
  });
});
