import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Cross-platform key/value persistence for non-secret app state (settings, custom prompts,
// later the offline outbox). Mirrors the auth session's storage seam: expo-secure-store is
// native-only, so the web target falls back to localStorage. Values are small JSON strings.
export const localStore = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        // Storage may be unavailable (private mode); state stays in-memory.
      }
      return;
    }
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Ignore native storage errors; the caller keeps its in-memory copy.
    }
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        // ignore
      }
      return;
    }
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // ignore
    }
  },
};

/** Reads a JSON value, returning `fallback` when missing or unparseable. */
export async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await localStore.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Serializes and persists a JSON value. */
export async function writeJson<T>(key: string, value: T): Promise<void> {
  await localStore.setItem(key, JSON.stringify(value));
}
