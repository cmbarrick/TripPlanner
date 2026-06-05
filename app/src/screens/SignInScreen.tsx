import React from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

/** Minimal branded splash shown while the persisted auth session is loading. */
export function AuthSplash() {
  return (
    <View style={s.splash}>
      <Text style={s.logo}>🧭</Text>
      <Text style={s.brand}>Wander</Text>
      <ActivityIndicator color={colors.brand} style={{ marginTop: 22 }} />
    </View>
  );
}

/**
 * Sign-in gate shown when Entra is configured but the traveler isn't signed in — instead of loading
 * the app with demo data. Keeps a low-emphasis "Browse demo data" path so a misconfigured or offline
 * API never hard-locks the app.
 */
export function SignInScreen({
  busy,
  error,
  onSignIn,
  onContinueAsGuest,
}: {
  busy: boolean;
  error: string | null;
  onSignIn: () => void;
  onContinueAsGuest: () => void;
}) {
  return (
    <View style={s.root}>
      <View style={s.hero}>
        <Text style={s.logo}>🧭</Text>
        <Text style={s.brand}>Wander</Text>
        <Text style={s.tagline}>Plan the trip. Capture the journey.</Text>
      </View>

      <View style={s.footer}>
        <Pressable
          style={[s.signInBtn, busy && { opacity: 0.6 }]}
          onPress={onSignIn}
          disabled={busy}
          accessibilityLabel="Sign in"
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.signInText}>Sign in</Text>}
        </Pressable>

        {error ? <Text style={s.error}>{error}</Text> : null}

        <Pressable
          onPress={onContinueAsGuest}
          hitSlop={8}
          accessibilityLabel="Browse demo data without signing in"
        >
          <Text style={s.guest}>Browse demo data</Text>
        </Pressable>

        <Text style={s.fine}>Sign in to sync your trips, journal, and photos across devices.</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { fontSize: 64 },
  brand: { fontSize: 34, fontWeight: '900', color: colors.ink, letterSpacing: -1, marginTop: 8 },
  tagline: { fontSize: 14, color: colors.ink400, marginTop: 10, textAlign: 'center' },
  footer: { paddingBottom: 28, gap: 14, alignItems: 'center' },
  signInBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 15,
    borderRadius: radius.md,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  signInText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  guest: { color: colors.brand, fontSize: 13, fontWeight: '700', marginTop: 2 },
  error: { color: colors.danger, fontSize: 12, textAlign: 'center' },
  fine: { fontSize: 11, color: colors.ink400, textAlign: 'center', lineHeight: 16, marginTop: 2 },
});
