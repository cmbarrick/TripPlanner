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

import {
  enqueueNoteCreate,
  enqueueNoteUpdate,
  enqueueNoteDelete,
  flushOutbox,
  isTempNoteId,
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
