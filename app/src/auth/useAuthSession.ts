import { useCallback, useEffect, useState } from 'react';
import {
  AuthState,
  getAuthStateSnapshot,
  initializeAuthState,
  isEntraAuthConfigured,
  signInWithEntra,
  signOut as clearAuthSession,
} from './session';

export function useAuthSession() {
  const [auth, setAuth] = useState<AuthState>(getAuthStateSnapshot());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    initializeAuthState()
      .then((state) => {
        if (active) setAuth(state);
      })
      .catch(() => {
        if (active) setError('Failed to load previous auth session.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const state = await signInWithEntra();
      setAuth(state);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const state = await clearAuthSession();
      setAuth(state);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign out failed.');
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    auth,
    loading,
    busy,
    error,
    entraConfigured: isEntraAuthConfigured(),
    signIn,
    signOut,
  };
}
