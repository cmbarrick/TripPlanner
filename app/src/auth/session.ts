import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// expo-secure-store is native-only; on web it has no implementation and calls
// like setItemAsync throw. Fall back to localStorage for the web target.
const sessionStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        // Storage may be unavailable (private mode); session stays in-memory.
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        // Ignore storage errors on web.
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

const STORAGE_KEY = 'wander.auth.session.v1';
// Holds the PKCE verifier + state across the web full-page redirect to the IdP.
const PENDING_KEY = 'wander.auth.pending.v1';
const FALLBACK_SUBJECT = 'authenticated-user';
const DEV_USER_ID = process.env.EXPO_PUBLIC_DEV_USER_ID;
const AUTH_ISSUER = process.env.EXPO_PUBLIC_AUTH_ISSUER;
const AUTH_CLIENT_ID = process.env.EXPO_PUBLIC_AUTH_CLIENT_ID;
const AUTH_AUDIENCE = process.env.EXPO_PUBLIC_AUTH_AUDIENCE;
const AUTH_SCOPES = (process.env.EXPO_PUBLIC_AUTH_SCOPES ?? 'openid profile email offline_access')
  .split(' ')
  .map((scope: string) => scope.trim())
  .filter(Boolean);

export type AuthMode = 'none' | 'dev-bypass' | 'entra';

export type AuthState = {
  mode: AuthMode;
  isAuthenticated: boolean;
  subject: string | null;
  email: string | null;
  displayName: string | null;
  accessToken: string | null;
  expiresAtUnixSeconds: number | null;
};

type StoredAuthSession = Omit<AuthState, 'mode' | 'isAuthenticated'>;

function decodeBase64Url(input: string): string | null {
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    if (typeof atob === 'function') {
      const binary = atob(padded);
      try {
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        return new TextDecoder().decode(bytes);
      } catch {
        return binary;
      }
    }
    // Node / native fallback when atob is unavailable.
    const BufferCtor = (globalThis as { Buffer?: { from(s: string, e: string): { toString(e: string): string } } }).Buffer;
    if (BufferCtor) {
      return BufferCtor.from(padded, 'base64').toString('utf-8');
    }
    return null;
  } catch {
    return null;
  }
}

function decodeJwtClaims(token: string | undefined | null): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const json = decodeBase64Url(parts[1]);
  if (!json) return null;
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function defaultState(): AuthState {
  if (DEV_USER_ID) {
    return {
      mode: 'dev-bypass',
      isAuthenticated: true,
      subject: DEV_USER_ID,
      email: `${DEV_USER_ID}@local.dev`,
      displayName: 'Local Dev User',
      accessToken: null,
      expiresAtUnixSeconds: null,
    };
  }

  return {
    mode: 'none',
    isAuthenticated: false,
    subject: null,
    email: null,
    displayName: null,
    accessToken: null,
    expiresAtUnixSeconds: null,
  };
}

let currentState: AuthState = defaultState();

export function isEntraAuthConfigured(): boolean {
  return Boolean(AUTH_ISSUER && AUTH_CLIENT_ID);
}

export async function initializeAuthState(): Promise<AuthState> {
  if (!isEntraAuthConfigured()) {
    currentState = defaultState();
    return currentState;
  }

  try {
    const serialized = await sessionStorage.getItem(STORAGE_KEY);
    if (!serialized) {
      currentState = defaultState();
      return currentState;
    }

    const parsed = JSON.parse(serialized) as StoredAuthSession;
    const now = Math.floor(Date.now() / 1000);
    if (parsed.expiresAtUnixSeconds && parsed.expiresAtUnixSeconds <= now) {
      await sessionStorage.removeItem(STORAGE_KEY);
      currentState = defaultState();
      return currentState;
    }

    currentState = {
      mode: 'entra',
      isAuthenticated: Boolean(parsed.accessToken),
      subject: parsed.subject ?? FALLBACK_SUBJECT,
      email: parsed.email ?? null,
      displayName: parsed.displayName ?? 'Signed-in Traveler',
      accessToken: parsed.accessToken ?? null,
      expiresAtUnixSeconds: parsed.expiresAtUnixSeconds ?? null,
    };
    return currentState;
  } catch {
    currentState = defaultState();
    return currentState;
  }
}

async function persistSession(next: StoredAuthSession): Promise<void> {
  await sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

type Discovery = Awaited<ReturnType<typeof AuthSession.fetchDiscoveryAsync>>;

function buildAuthRequest(): { request: AuthSession.AuthRequest; redirectUri: string } {
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'wander', path: 'auth' });
  const request = new AuthSession.AuthRequest({
    clientId: AUTH_CLIENT_ID!,
    scopes: AUTH_SCOPES,
    responseType: AuthSession.ResponseType.Code,
    redirectUri,
    usePKCE: true,
    // `select_account` always shows the account chooser so the user can pick the
    // correct work/school account instead of silently reusing an SSO session.
    prompt: AuthSession.Prompt.SelectAccount,
    extraParams: AUTH_AUDIENCE ? { audience: AUTH_AUDIENCE } : undefined,
  });
  return { request, redirectUri };
}

// Exchanges an authorization code for tokens, reads profile claims from the ID
// token (we deliberately skip the OIDC userInfo endpoint — our access token is
// audience-scoped to the Wander API, so Microsoft Graph rejects it with 401),
// then persists and returns the authenticated session.
async function finalizeTokenExchange(
  discovery: Discovery,
  redirectUri: string,
  code: string,
  codeVerifier?: string
): Promise<AuthState> {
  const tokenResponse = await AuthSession.exchangeCodeAsync(
    {
      clientId: AUTH_CLIENT_ID!,
      code,
      redirectUri,
      scopes: AUTH_SCOPES,
      extraParams: {
        ...(AUTH_AUDIENCE ? { audience: AUTH_AUDIENCE } : {}),
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      },
    },
    discovery
  );

  const accessToken = tokenResponse.accessToken;
  if (!accessToken) {
    throw new Error('No access token returned from Entra.');
  }

  const expiresAtUnixSeconds = tokenResponse.expiresIn
    ? Math.floor(Date.now() / 1000) + tokenResponse.expiresIn
    : null;

  let subject = FALLBACK_SUBJECT;
  let email: string | null = null;
  let displayName: string | null = 'Signed-in Traveler';

  const claims = decodeJwtClaims(tokenResponse.idToken);
  if (claims) {
    if (typeof claims.sub === 'string') subject = claims.sub;
    if (typeof claims.email === 'string') email = claims.email;
    else if (typeof claims.preferred_username === 'string') email = claims.preferred_username;
    if (typeof claims.name === 'string') displayName = claims.name;
  }

  const stored: StoredAuthSession = {
    subject,
    email,
    displayName,
    accessToken,
    expiresAtUnixSeconds,
  };
  await persistSession(stored);

  currentState = {
    mode: 'entra',
    isAuthenticated: true,
    ...stored,
  };
  return currentState;
}

export async function signInWithEntra(): Promise<AuthState> {
  if (!AUTH_ISSUER || !AUTH_CLIENT_ID) {
    throw new Error('Entra auth is not configured. Set EXPO_PUBLIC_AUTH_ISSUER and EXPO_PUBLIC_AUTH_CLIENT_ID.');
  }

  const discovery = await AuthSession.fetchDiscoveryAsync(AUTH_ISSUER);
  const { request, redirectUri } = buildAuthRequest();
  await request.makeAuthUrlAsync(discovery);

  // Web: use a full-page redirect instead of a popup. Identity providers such as
  // Microsoft send a Cross-Origin-Opener-Policy header that severs the
  // popup<->opener link, which breaks expo-web-browser's postMessage-based popup
  // completion (the popup gets stranded on /auth and the opener reports the login
  // as "cancelled"). A top-level redirect sidesteps COOP entirely.
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    await sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ codeVerifier: request.codeVerifier ?? null, state: request.state })
    );
    window.location.assign(request.url!);
    // The page is navigating away to the identity provider; this never resolves.
    return new Promise<AuthState>(() => {});
  }

  // Native: the in-app browser / system popup works fine (no COOP severance).
  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params.code) {
    throw new Error('Login was cancelled or did not return an authorization code.');
  }
  return finalizeTokenExchange(discovery, redirectUri, result.params.code, request.codeVerifier);
}

/**
 * Completes a web full-page redirect sign-in. Call this when the app loads on the
 * OAuth redirect route (`/auth?code=...`). It exchanges the authorization code for
 * tokens and persists the session; the caller should then navigate back into the app
 * (the persisted session is picked up by `initializeAuthState`).
 */
export async function completeWebSignIn(): Promise<AuthState> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return currentState;
  }
  if (!AUTH_ISSUER || !AUTH_CLIENT_ID) {
    throw new Error('Entra auth is not configured.');
  }

  const params = new URLSearchParams(window.location.search);
  const errorCode = params.get('error');
  if (errorCode) {
    await sessionStorage.removeItem(PENDING_KEY);
    throw new Error(params.get('error_description') ?? errorCode);
  }

  const code = params.get('code');
  if (!code) {
    // Not a redirect callback — fall back to any previously stored session.
    return initializeAuthState();
  }

  const pendingRaw = await sessionStorage.getItem(PENDING_KEY);
  await sessionStorage.removeItem(PENDING_KEY);
  if (!pendingRaw) {
    throw new Error('No pending sign-in was found. Please start sign-in again.');
  }
  const pending = JSON.parse(pendingRaw) as { codeVerifier: string | null; state: string };
  const returnedState = params.get('state');
  if (pending.state && returnedState && pending.state !== returnedState) {
    throw new Error('Sign-in state did not match. Please try again.');
  }

  const discovery = await AuthSession.fetchDiscoveryAsync(AUTH_ISSUER);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'wander', path: 'auth' });
  return finalizeTokenExchange(discovery, redirectUri, code, pending.codeVerifier ?? undefined);
}

export async function signOut(): Promise<AuthState> {
  await sessionStorage.removeItem(STORAGE_KEY);
  currentState = defaultState();
  return currentState;
}

export function getAuthStateSnapshot(): AuthState {
  return currentState;
}
