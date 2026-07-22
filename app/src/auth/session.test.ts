/**
 * Regression coverage for silent token refresh (session.ts). Before this fix, the client read
 * the access token straight off the in-memory snapshot with no expiry check or refresh at all —
 * every session degraded to the demo-data fallback after Entra's ~60-90 min token lifetime,
 * recoverable only by manually signing out and back in. Confirmed live, not hypothetical.
 */
const mockStore: Record<string, string> = {};

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore[key] ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore[key] = value;
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    delete mockStore[key];
  }),
}));

const mockFetchDiscoveryAsync = jest.fn(async (..._args: any[]) => ({} as any));
const mockRefreshAsync = jest.fn();

jest.mock('expo-auth-session', () => ({
  fetchDiscoveryAsync: (...args: any[]) => mockFetchDiscoveryAsync(...args),
  refreshAsync: (...args: any[]) => mockRefreshAsync(...args),
  exchangeCodeAsync: jest.fn(),
  makeRedirectUri: jest.fn(() => 'wander://auth'),
  AuthRequest: jest.fn(),
  ResponseType: { Code: 'code' },
  Prompt: { SelectAccount: 'select_account' },
}));

function base64url(json: string): string {
  return globalThis
    .btoa(json)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function makeIdToken(claims: Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: 'none' }));
  const payload = base64url(JSON.stringify(claims));
  return `${header}.${payload}.`;
}

describe('session — silent token refresh', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    for (const key of Object.keys(mockStore)) delete mockStore[key];
    mockFetchDiscoveryAsync.mockClear();
    mockRefreshAsync.mockReset();
    process.env = {
      ...OLD_ENV,
      EXPO_PUBLIC_AUTH_ISSUER: 'https://wandertripapp.ciamlogin.com/wandertripapp.onmicrosoft.com/v2.0',
      EXPO_PUBLIC_AUTH_CLIENT_ID: 'client-123',
      EXPO_PUBLIC_DEV_USER_ID: undefined,
    };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('ensureFreshToken returns the current token unchanged when nowhere near expiry', async () => {
    const session = require('./session');
    const now = Math.floor(Date.now() / 1000);
    mockStore['wander.auth.session.v1'] = JSON.stringify({
      subject: 'user-1',
      email: 'a@b.com',
      displayName: 'A B',
      accessToken: 'still-good-token',
      refreshToken: 'refresh-1',
      expiresAtUnixSeconds: now + 3600,
    });

    await session.initializeAuthState();
    const token = await session.ensureFreshToken();

    expect(token).toBe('still-good-token');
    expect(mockRefreshAsync).not.toHaveBeenCalled();
  });

  it('ensureFreshToken silently refreshes an expired session instead of requiring manual sign-in', async () => {
    const session = require('./session');
    const now = Math.floor(Date.now() / 1000);
    mockStore['wander.auth.session.v1'] = JSON.stringify({
      subject: 'user-1',
      email: 'a@b.com',
      displayName: 'A B',
      accessToken: 'expired-token',
      refreshToken: 'refresh-1',
      expiresAtUnixSeconds: now - 10,
    });

    mockRefreshAsync.mockResolvedValue({
      idToken: makeIdToken({ sub: 'user-1', email: 'a@b.com', name: 'A B' }),
      refreshToken: 'refresh-2',
      expiresIn: 3600,
    });

    const state = await session.initializeAuthState();

    expect(mockRefreshAsync).toHaveBeenCalledTimes(1);
    expect(state.isAuthenticated).toBe(true);
    expect(state.accessToken).toContain('.');

    const token = await session.ensureFreshToken();
    // Already fresh from the refresh above -- no second refresh call needed.
    expect(mockRefreshAsync).toHaveBeenCalledTimes(1);
    expect(token).toBe(state.accessToken);
  });

  it('ensureFreshToken proactively refreshes a token that is about to expire (within the buffer)', async () => {
    const session = require('./session');
    const now = Math.floor(Date.now() / 1000);
    mockStore['wander.auth.session.v1'] = JSON.stringify({
      subject: 'user-1',
      email: 'a@b.com',
      displayName: 'A B',
      accessToken: 'about-to-expire',
      refreshToken: 'refresh-1',
      expiresAtUnixSeconds: now + 10, // inside the 60s refresh buffer
    });

    mockRefreshAsync.mockResolvedValue({
      idToken: makeIdToken({ sub: 'user-1' }),
      refreshToken: 'refresh-2',
      expiresIn: 3600,
    });

    await session.initializeAuthState();
    const token = await session.ensureFreshToken();

    expect(mockRefreshAsync).toHaveBeenCalledTimes(1);
    expect(token).not.toBe('about-to-expire');
  });

  it('signs out when the refresh token itself is no longer valid', async () => {
    const session = require('./session');
    const now = Math.floor(Date.now() / 1000);
    mockStore['wander.auth.session.v1'] = JSON.stringify({
      subject: 'user-1',
      email: 'a@b.com',
      displayName: 'A B',
      accessToken: 'expired-token',
      refreshToken: 'dead-refresh-token',
      expiresAtUnixSeconds: now - 10,
    });

    mockRefreshAsync.mockRejectedValue(new Error('invalid_grant'));

    const state = await session.initializeAuthState();

    expect(state.isAuthenticated).toBe(false);
    expect(state.mode).toBe('none');
    expect(mockStore['wander.auth.session.v1']).toBeUndefined();
  });

  it('ensureFreshToken is a no-op for non-entra sessions (dev-bypass/guest)', async () => {
    process.env.EXPO_PUBLIC_DEV_USER_ID = 'local-dev-user';
    const session = require('./session');

    await session.initializeAuthState();
    const token = await session.ensureFreshToken();

    expect(token).toBeNull();
    expect(mockRefreshAsync).not.toHaveBeenCalled();
  });
});
