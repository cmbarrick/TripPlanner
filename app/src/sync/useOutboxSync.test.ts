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

import { ApiError, createVoiceNote, createPhotoNote } from '../api';
import { runOp } from './useOutboxSync';
import { OutboxOp } from './outbox';

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
