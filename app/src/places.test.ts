/**
 * Unit tests for place search helper logic.
 * API network calls are stubbed via globalThis.fetch so no real backend is needed.
 */
import * as api from './api';

// jest-expo provides a fetch polyfill in the test environment; we spy on it.
const mockJson = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('searchPlaces', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis as any, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());

  it('returns empty array for blank query without calling fetch', async () => {
    const result = await api.searchPlaces('');
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns empty array for whitespace-only query without calling fetch', async () => {
    const result = await api.searchPlaces('   ');
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns candidates from the API on success', async () => {
    const candidates: api.PlaceCandidate[] = [
      { placeId: 'p1', name: 'Eiffel Tower', address: 'Paris', latitude: 48.858, longitude: 2.294 },
    ];
    fetchSpy.mockReturnValueOnce(mockJson(candidates));

    const result = await api.searchPlaces('Eiffel');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Eiffel Tower');
    expect(result[0].placeId).toBe('p1');
    expect(result[0].latitude).toBe(48.858);
  });

  it('degrades gracefully when the network throws (provider unavailable)', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network error'));
    const result = await api.searchPlaces('Rome');
    expect(result).toEqual([]);
  });

  it('degrades gracefully when the API responds with non-2xx status', async () => {
    fetchSpy.mockReturnValueOnce(mockJson('Service unavailable', 503));
    const result = await api.searchPlaces('Barcelona');
    expect(result).toEqual([]);
  });

  it('includes the query in the URL', async () => {
    fetchSpy.mockReturnValueOnce(mockJson([]));
    await api.searchPlaces('Colosseum');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('Colosseum'),
      expect.anything(),
    );
  });
});

describe('getPlaceDetails', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis as any, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());

  it('returns details on success', async () => {
    const detail: api.PlaceDetails = {
      placeId: 'p1',
      name: 'Colosseum',
      address: 'Rome, Italy',
      latitude: 41.890,
      longitude: 12.492,
    };
    fetchSpy.mockReturnValueOnce(mockJson(detail));

    const result = await api.getPlaceDetails('p1');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Colosseum');
    expect(result!.latitude).toBe(41.890);
  });

  it('returns null when the API throws', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('timeout'));
    const result = await api.getPlaceDetails('nonexistent');
    expect(result).toBeNull();
  });
});
