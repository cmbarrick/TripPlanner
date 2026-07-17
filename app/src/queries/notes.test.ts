import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// In-memory storage mock so the outbox's persistence round-trips without native modules — same
// pattern as sync/outbox.test.ts.
const mockMem = new Map<string, string>();
jest.mock('../storage', () => ({
  readJson: async (key: string, fallback: unknown) => {
    const raw = mockMem.get(key);
    return raw ? JSON.parse(raw) : fallback;
  },
  writeJson: async (key: string, value: unknown) => {
    mockMem.set(key, JSON.stringify(value));
  },
}));

jest.mock('../sync/mediaCache', () => ({
  cacheMedia: jest.fn(async () => {}),
  loadCachedMedia: jest.fn(async () => null),
  deleteCachedMedia: jest.fn(async () => {}),
}));

jest.mock('../api', () => ({
  getTripNotes: jest.fn(),
}));

import { getTripNotes } from '../api';
import { useTripNotesQuery } from './notes';
import { enqueueNoteCreate, enqueueMediaNote, __resetOutboxForTests } from '../sync/outbox';

const serverNote = {
  id: 'real-1',
  tripId: 't1',
  ownerId: 'owner',
  scope: 'Trip' as const,
  kind: 'Text' as const,
  bodyText: 'A real synced note',
  mediaAssets: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  mockMem.clear();
  __resetOutboxForTests();
  jest.clearAllMocks();
});

describe('useTripNotesQuery — pending-op overlay', () => {
  it('overlays a still-queued create onto the fetched list, newest first', async () => {
    (getTripNotes as jest.Mock).mockResolvedValue({ data: [serverNote], live: true });
    await enqueueNoteCreate('t1', { scope: 'Trip', bodyText: 'captured offline' });

    const { result } = renderHook(() => useTripNotesQuery('t1'), { wrapper });

    await waitFor(() => expect(result.current.data?.data).toHaveLength(2));
    const [first, second] = result.current.data!.data;
    expect(first.pendingSync).toBe(true);
    expect(first.bodyText).toBe('captured offline');
    expect(second.id).toBe('real-1');
  });

  it('overlays a still-queued voice/photo note with pendingMediaKind set', async () => {
    (getTripNotes as jest.Mock).mockResolvedValue({ data: [], live: true });
    const audio = { uri: 'file://x.m4a', name: 'x.m4a', type: 'audio/m4a' };
    await enqueueMediaNote('t1', 'Voice', { scope: 'Trip' }, audio, 'x.m4a');

    const { result } = renderHook(() => useTripNotesQuery('t1'), { wrapper });

    await waitFor(() => expect(result.current.data?.data).toHaveLength(1));
    expect(result.current.data!.data[0].pendingMediaKind).toBe('Voice');
    expect(result.current.data!.data[0].kind).toBe('Voice');
  });

  it('surfaces queued captures even when the fetch itself fails (cold-started offline)', async () => {
    (getTripNotes as jest.Mock).mockResolvedValue({ data: [], live: false });
    await enqueueNoteCreate('t1', { scope: 'Trip', bodyText: 'only queued' });

    const { result } = renderHook(() => useTripNotesQuery('t1'), { wrapper });

    await waitFor(() => expect(result.current.data?.data).toHaveLength(1));
    expect(result.current.data!.data[0].bodyText).toBe('only queued');
    expect(result.current.data!.live).toBe(false);
  });

  it('does not overlay ops queued for a different trip', async () => {
    (getTripNotes as jest.Mock).mockResolvedValue({ data: [serverNote], live: true });
    await enqueueNoteCreate('other-trip', { scope: 'Trip', bodyText: 'not this trip' });

    const { result } = renderHook(() => useTripNotesQuery('t1'), { wrapper });

    await waitFor(() => expect(result.current.data?.data).toBeDefined());
    expect(result.current.data!.data).toHaveLength(1);
    expect(result.current.data!.data[0].id).toBe('real-1');
  });
});
