jest.mock('../api', () => ({
  ApiError: class ApiError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
    }
  },
  createNote: jest.fn(),
  updateNote: jest.fn(),
  deleteNote: jest.fn(),
  createVoiceNote: jest.fn(),
  createPhotoNote: jest.fn(),
}));

const mockMediaStore = new Map<string, unknown>();
const mockDeleteCachedMedia = jest.fn(async (key: string) => {
  mockMediaStore.delete(key);
});
jest.mock('./mediaCache', () => ({
  loadCachedMedia: async (key: string) => mockMediaStore.get(key) ?? null,
  deleteCachedMedia: (...args: [string]) => mockDeleteCachedMedia(...args),
}));

// In-memory storage mock so enqueueing (for the useSyncStatus tests below) doesn't touch native
// modules — same pattern as sync/outbox.test.ts.
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

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError, createNote, createVoiceNote, createPhotoNote } from '../api';
import { runOp, useSyncStatus } from './useOutboxSync';
import { OutboxOp, enqueueNoteCreate, __resetOutboxForTests } from './outbox';

const voiceOp: OutboxOp = {
  id: 'op-1',
  kind: 'note.media',
  tripId: 't1',
  tempNoteId: 'temp-1',
  mediaKind: 'Voice',
  cacheKey: 'temp-1',
  fileName: 'voice-note.m4a',
  fields: { scope: 'Trip' },
  createdAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMediaStore.clear();
  mockMem.clear();
  __resetOutboxForTests();
});

describe('runOp — note.media', () => {
  it('uploads the cached file, cleans up, and reports done', async () => {
    const audio = { uri: 'file://rec.m4a', name: 'voice-note.m4a', type: 'audio/m4a' };
    mockMediaStore.set('temp-1', audio);
    (createVoiceNote as jest.Mock).mockResolvedValue({ id: 'real-1' });

    const outcome = await runOp(voiceOp);

    expect(outcome).toBe('done');
    expect(createVoiceNote).toHaveBeenCalledWith('t1', { scope: 'Trip' }, audio, 'voice-note.m4a');
    expect(mockDeleteCachedMedia).toHaveBeenCalledWith('temp-1');
  });

  it('drops the op when the cached bytes are gone', async () => {
    const outcome = await runOp(voiceOp);
    expect(outcome).toBe('drop');
    expect(createVoiceNote).not.toHaveBeenCalled();
  });

  it('routes photo ops to createPhotoNote', async () => {
    const photoOp: OutboxOp = { ...voiceOp, mediaKind: 'Photo', fileName: 'photo.jpg' };
    const image = { uri: 'file://pic.jpg', name: 'photo.jpg', type: 'image/jpeg' };
    mockMediaStore.set('temp-1', image);
    (createPhotoNote as jest.Mock).mockResolvedValue({ id: 'real-2' });

    const outcome = await runOp(photoOp);

    expect(outcome).toBe('done');
    expect(createPhotoNote).toHaveBeenCalledWith('t1', { scope: 'Trip' }, image, 'photo.jpg');
  });

  it('retries on a transient failure and keeps the cached bytes', async () => {
    const audio = { uri: 'file://rec.m4a', name: 'voice-note.m4a', type: 'audio/m4a' };
    mockMediaStore.set('temp-1', audio);
    (createVoiceNote as jest.Mock).mockRejectedValue(new Error('network down'));

    const outcome = await runOp(voiceOp);

    expect(outcome).toBe('retry');
    expect(mockDeleteCachedMedia).not.toHaveBeenCalled();
    expect(mockMediaStore.has('temp-1')).toBe(true);
  });

  it('drops on a 4xx rejection and frees the cached bytes', async () => {
    const audio = { uri: 'file://rec.m4a', name: 'voice-note.m4a', type: 'audio/m4a' };
    mockMediaStore.set('temp-1', audio);
    (createVoiceNote as jest.Mock).mockRejectedValue(new ApiError('bad request', 400));

    const outcome = await runOp(voiceOp);

    expect(outcome).toBe('drop');
    expect(mockDeleteCachedMedia).toHaveBeenCalledWith('temp-1');
  });
});

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useSyncStatus', () => {
  it('retryNow drains the queue and updates pendingCount/blocked reactively', async () => {
    await enqueueNoteCreate('t1', { scope: 'Trip', bodyText: 'hello' });
    (createNote as jest.Mock).mockResolvedValue({ id: 'real-1' });

    const { result } = renderHook(() => useSyncStatus(), { wrapper });
    await waitFor(() => expect(result.current.pendingCount).toBe(1));

    let drained = 0;
    await act(async () => {
      drained = await result.current.retryNow();
    });

    expect(drained).toBe(1);
    expect(createNote).toHaveBeenCalledWith('t1', { scope: 'Trip', bodyText: 'hello' });
    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(result.current.blocked).toBe(false);
  });

  it('reports blocked after retryNow hits a transient failure', async () => {
    await enqueueNoteCreate('t1', { scope: 'Trip', bodyText: 'hello' });
    (createNote as jest.Mock).mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useSyncStatus(), { wrapper });
    await waitFor(() => expect(result.current.pendingCount).toBe(1));

    await act(async () => {
      await result.current.retryNow();
    });

    expect(result.current.pendingCount).toBe(1);
    await waitFor(() => expect(result.current.blocked).toBe(true));
  });
});
