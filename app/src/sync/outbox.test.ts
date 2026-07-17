// In-memory storage mock so the outbox's persistence round-trips without native modules.
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

// In-memory media cache mock — the real one talks to expo-file-system/IndexedDB, neither of
// which the outbox itself should need to know about (see mediaCache.ts / mediaCache.web.ts).
const mockMediaStore = new Map<string, unknown>();
const mockCacheMedia = jest.fn(async (key: string, file: unknown, _fileName: string) => {
  mockMediaStore.set(key, file);
});
const mockDeleteCachedMedia = jest.fn(async (key: string) => {
  mockMediaStore.delete(key);
});
jest.mock('./mediaCache', () => ({
  cacheMedia: (...args: [string, unknown, string]) => mockCacheMedia(...args),
  loadCachedMedia: async (key: string) => mockMediaStore.get(key) ?? null,
  deleteCachedMedia: (...args: [string]) => mockDeleteCachedMedia(...args),
}));

import { renderHook, waitFor } from '@testing-library/react-native';
import {
  enqueueNoteCreate,
  enqueueNoteUpdate,
  enqueueNoteDelete,
  enqueueMediaNote,
  flushOutbox,
  isTempNoteId,
  useOutbox,
  __resetOutboxForTests,
  OutboxOp,
  FlushOutcome,
} from './outbox';

const STORAGE_KEY = 'wander.sync.outbox.v1';

function persisted(): OutboxOp[] {
  const raw = mockMem.get(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as OutboxOp[]) : [];
}

beforeEach(() => {
  mockMem.clear();
  mockMediaStore.clear();
  mockCacheMedia.mockClear();
  mockDeleteCachedMedia.mockClear();
  __resetOutboxForTests();
});

describe('enqueue', () => {
  it('queues a create and returns a temp note id', async () => {
    const tempId = await enqueueNoteCreate('t1', { scope: 'Trip', bodyText: 'hello' });
    expect(isTempNoteId(tempId)).toBe(true);
    const q = persisted();
    expect(q).toHaveLength(1);
    expect(q[0].kind).toBe('note.create');
  });

  it('folds an edit of a still-pending create into that create (no new op)', async () => {
    const tempId = await enqueueNoteCreate('t1', { scope: 'Trip', bodyText: 'first' });
    await enqueueNoteUpdate('t1', tempId, 'edited');
    const q = persisted();
    expect(q).toHaveLength(1);
    expect(q[0].kind).toBe('note.create');
    if (q[0].kind === 'note.create') expect(q[0].input.bodyText).toBe('edited');
  });

  it('collapses repeated edits of a synced note into one update', async () => {
    await enqueueNoteUpdate('t1', 'real-1', 'a');
    await enqueueNoteUpdate('t1', 'real-1', 'b');
    const q = persisted();
    expect(q).toHaveLength(1);
    if (q[0].kind === 'note.update') expect(q[0].bodyText).toBe('b');
  });

  it('deleting a still-pending create drops the create (and its edits), no delete op', async () => {
    const tempId = await enqueueNoteCreate('t1', { scope: 'Trip', bodyText: 'first' });
    await enqueueNoteUpdate('t1', tempId, 'edited');
    await enqueueNoteDelete('t1', tempId);
    expect(persisted()).toHaveLength(0);
  });

  it('deleting a synced note drops pending edits and queues a delete', async () => {
    await enqueueNoteUpdate('t1', 'real-1', 'a');
    await enqueueNoteDelete('t1', 'real-1');
    const q = persisted();
    expect(q).toHaveLength(1);
    expect(q[0].kind).toBe('note.delete');
  });
});

describe('media notes', () => {
  it('queues a voice note and caches its bytes under the temp note id', async () => {
    const audio = { uri: 'file://rec.m4a', name: 'voice-note.m4a', type: 'audio/m4a' };
    const tempId = await enqueueMediaNote('t1', 'Voice', { scope: 'Trip' }, audio, 'voice-note.m4a');
    expect(isTempNoteId(tempId)).toBe(true);
    expect(mockCacheMedia).toHaveBeenCalledWith(tempId, audio, 'voice-note.m4a');
    const q = persisted();
    expect(q).toHaveLength(1);
    expect(q[0].kind).toBe('note.media');
    if (q[0].kind === 'note.media') {
      expect(q[0].mediaKind).toBe('Voice');
      expect(q[0].cacheKey).toBe(tempId);
    }
  });

  it('folds a caption edit into a still-pending photo note', async () => {
    const photo = new Blob(['x']);
    const tempId = await enqueueMediaNote('t1', 'Photo', { scope: 'Trip' }, photo, 'photo.jpg');
    await enqueueNoteUpdate('t1', tempId, 'On the summit');
    const q = persisted();
    expect(q).toHaveLength(1);
    if (q[0].kind === 'note.media') expect(q[0].fields.bodyText).toBe('On the summit');
  });

  it('deleting a still-pending media note drops the op and frees its cached bytes', async () => {
    const photo = new Blob(['x']);
    const tempId = await enqueueMediaNote('t1', 'Photo', { scope: 'Trip' }, photo, 'photo.jpg');
    await enqueueNoteDelete('t1', tempId);
    expect(persisted()).toHaveLength(0);
    expect(mockDeleteCachedMedia).toHaveBeenCalledWith(tempId);
  });

  it('flushing a media op uploads the cached file and frees it on success', async () => {
    const audio = { uri: 'file://rec.m4a', name: 'voice-note.m4a', type: 'audio/m4a' };
    const tempId = await enqueueMediaNote('t1', 'Voice', { scope: 'Trip' }, audio, 'voice-note.m4a');
    expect(mockMediaStore.get(tempId)).toEqual(audio);
    const drained = await flushOutbox(async (op) => {
      if (op.kind === 'note.media') expect(mockMediaStore.get(op.cacheKey)).toEqual(audio);
      return 'done';
    });
    expect(drained).toBe(1);
    expect(persisted()).toHaveLength(0);
  });
});

describe('flushOutbox', () => {
  it('drains ops in FIFO order on success', async () => {
    await enqueueNoteCreate('t1', { scope: 'Trip', bodyText: '1' });
    await enqueueNoteCreate('t1', { scope: 'Trip', bodyText: '2' });
    const seen: string[] = [];
    const drained = await flushOutbox(async (op) => {
      if (op.kind === 'note.create') seen.push(op.input.bodyText ?? '');
      return 'done';
    });
    expect(drained).toBe(2);
    expect(seen).toEqual(['1', '2']);
    expect(persisted()).toHaveLength(0);
  });

  it('stops at the first retry and keeps the remaining queue', async () => {
    await enqueueNoteCreate('t1', { scope: 'Trip', bodyText: '1' });
    await enqueueNoteCreate('t1', { scope: 'Trip', bodyText: '2' });
    let calls = 0;
    const drained = await flushOutbox(async (): Promise<FlushOutcome> => {
      calls += 1;
      return calls === 1 ? 'done' : 'retry';
    });
    expect(drained).toBe(1);
    expect(persisted()).toHaveLength(1); // the second op survives for the next attempt
  });

  it('drops a server-rejected op so it can not poison the queue', async () => {
    await enqueueNoteCreate('t1', { scope: 'Trip', bodyText: 'bad' });
    const drained = await flushOutbox(async () => 'drop');
    expect(drained).toBe(0); // a drop is not counted as a successful sync
    expect(persisted()).toHaveLength(0);
  });

  it('treats a thrown runner as retry (transient)', async () => {
    await enqueueNoteCreate('t1', { scope: 'Trip', bodyText: 'x' });
    const drained = await flushOutbox(async () => {
      throw new Error('network down');
    });
    expect(drained).toBe(0);
    expect(persisted()).toHaveLength(1);
  });
});

describe('useOutbox — blocked status', () => {
  it('is not blocked with an empty queue', async () => {
    const { result } = renderHook(() => useOutbox());
    await waitFor(() => expect(result.current.blocked).toBe(false));
    expect(result.current.pendingCount).toBe(0);
  });

  it('flips to blocked when a flush stops on a retry, and reports it reactively', async () => {
    await enqueueNoteCreate('t1', { scope: 'Trip', bodyText: 'x' });
    const { result } = renderHook(() => useOutbox());
    await waitFor(() => expect(result.current.pendingCount).toBe(1));
    expect(result.current.blocked).toBe(false);

    await flushOutbox(async () => 'retry');

    await waitFor(() => expect(result.current.blocked).toBe(true));
  });

  it('clears blocked once a later flush drains the queue', async () => {
    await enqueueNoteCreate('t1', { scope: 'Trip', bodyText: 'x' });
    await flushOutbox(async () => 'retry');
    const { result } = renderHook(() => useOutbox());
    await waitFor(() => expect(result.current.blocked).toBe(true));

    await flushOutbox(async () => 'done');

    await waitFor(() => expect(result.current.blocked).toBe(false));
    expect(result.current.pendingCount).toBe(0);
  });
});
