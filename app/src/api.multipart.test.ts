/**
 * Unit tests for the XHR-based multipart upload path (createVoiceNote/createPhotoNote), covering
 * progress reporting and error parsing — the parts that changed when postMultipart moved off
 * `fetch` (no upload-progress event in any target environment) onto XMLHttpRequest.
 */
import * as api from './api';

type ProgressEvent = { lengthComputable: boolean; loaded: number; total: number };

class FakeXHR {
  static instances: FakeXHR[] = [];
  method = '';
  url = '';
  status = 0;
  responseText = '';
  headers: Record<string, string> = {};
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  sentBody: unknown;

  constructor() {
    FakeXHR.instances.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }
  send(body: unknown) {
    this.sentBody = body;
  }
}

const samplePhoto = { uri: 'file://pic.jpg', name: 'pic.jpg', type: 'image/jpeg' };
const sampleNote = { id: 'n1', tripId: 't1', scope: 'Trip', kind: 'Text', mediaAssets: [] };

describe('createPhotoNote (XHR multipart upload)', () => {
  let realXHR: typeof XMLHttpRequest;

  beforeEach(() => {
    FakeXHR.instances = [];
    realXHR = globalThis.XMLHttpRequest;
    (globalThis as any).XMLHttpRequest = FakeXHR;
  });
  afterEach(() => {
    globalThis.XMLHttpRequest = realXHR;
  });

  it('reports fractional progress as the upload advances', async () => {
    const seen: number[] = [];
    const promise = api.createPhotoNote('t1', { scope: 'Trip' }, samplePhoto, 'pic.jpg', (f) => seen.push(f));

    // Two hops: buildHeaders() now awaits ensureFreshToken() before the XHR is created.
    await Promise.resolve();
    await Promise.resolve();
    const xhr = FakeXHR.instances[0];
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 200 });
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 200, total: 200 });
    xhr.status = 200;
    xhr.responseText = JSON.stringify(sampleNote);
    xhr.onload?.();

    const note = await promise;
    expect(note.id).toBe('n1');
    expect(seen).toEqual([0.25, 1]);
  });

  it('ignores a non-length-computable progress event', async () => {
    const seen: number[] = [];
    const promise = api.createPhotoNote('t1', { scope: 'Trip' }, samplePhoto, 'pic.jpg', (f) => seen.push(f));

    // Two hops: buildHeaders() now awaits ensureFreshToken() before the XHR is created.
    await Promise.resolve();
    await Promise.resolve();
    const xhr = FakeXHR.instances[0];
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 10, total: 0 });
    xhr.status = 200;
    xhr.responseText = JSON.stringify(sampleNote);
    xhr.onload?.();

    await promise;
    expect(seen).toEqual([]);
  });

  it('rejects with the server-provided title on a 4xx response', async () => {
    const promise = api.createPhotoNote('t1', { scope: 'Trip' }, samplePhoto, 'pic.jpg');

    // Two hops: buildHeaders() now awaits ensureFreshToken() before the XHR is created.
    await Promise.resolve();
    await Promise.resolve();
    const xhr = FakeXHR.instances[0];
    xhr.status = 422;
    xhr.responseText = JSON.stringify({ title: 'Image too large.' });
    xhr.onload?.();

    await expect(promise).rejects.toMatchObject({ message: 'Image too large.', status: 422 });
  });

  it('rejects with an undefined status on a network-level failure (offline)', async () => {
    const promise = api.createPhotoNote('t1', { scope: 'Trip' }, samplePhoto, 'pic.jpg');

    // Two hops: buildHeaders() now awaits ensureFreshToken() before the XHR is created.
    await Promise.resolve();
    await Promise.resolve();
    const xhr = FakeXHR.instances[0];
    xhr.onerror?.();

    await expect(promise).rejects.toMatchObject({ status: undefined });
    expect(api.isOfflineError(await promise.catch((e) => e))).toBe(true);
  });
});
