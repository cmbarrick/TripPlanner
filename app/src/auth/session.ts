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

export async function signInWithEntra(): Promise<AuthState> {
  if (!AUTH_ISSUER || !AUTH_CLIENT_ID) {
    throw new Error('Entra auth is not configured. Set EXPO_PUBLIC_AUTH_ISSUER and EXPO_PUBLIC_AUTH_CLIENT_ID.');
  }

  const discovery = await AuthSession.fetchDiscoveryAsync(AUTH_ISSUER);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'wander', path: 'auth' });
  const request = new AuthSession.AuthRequest({
    clientId: AUTH_CLIENT_ID,
    scopes: AUTH_SCOPES,
    responseType: AuthSession.ResponseType.Code,
    redirectUri,
    usePKCE: true,
    extraParams: AUTH_AUDIENCE ? { audience: AUTH_AUDIENCE } : undefined,
  });

  await request.makeAuthUrlAsync(discovery);
  const result = await request.promptAsync(discovery);

  if (result.type !== 'success' || !result.params.code) {
    throw new Error('Login was cancelled or did not return an authorization code.');
  }

  const tokenResponse = await AuthSession.exchangeCodeAsync(
    {
      clientId: AUTH_CLIENT_ID,
      code: result.params.code,
      redirectUri,
      scopes: AUTH_SCOPES,
      extraParams: {
        ...(AUTH_AUDIENCE ? { audience: AUTH_AUDIENCE } : {}),
        ...(request.codeVerifier ? { code_verifier: request.codeVerifier } : {}),
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

  if (discovery.userInfoEndpoint) {
    try {
      const userInfoResponse = await fetch(discovery.userInfoEndpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userInfoResponse.ok) {
        const payload = (await userInfoResponse.json()) as Record<string, unknown>;
        subject = typeof payload.sub === 'string' ? payload.sub : subject;
        email = typeof payload.email === 'string' ? payload.email : null;
        displayName = typeof payload.name === 'string' ? payload.name : displayName;
      }
    } catch {
      // UserInfo is optional; API ownership still uses JWT claims.
    }
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

export async function signOut(): Promise<AuthState> {
  await sessionStorage.removeItem(STORAGE_KEY);
  currentState = defaultState();
  return currentState;
}

export function getAuthStateSnapshot(): AuthState {
  return currentState;
}
