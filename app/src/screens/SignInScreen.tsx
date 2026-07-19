import React from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius } from '../theme';

/** Decorative translucent rings used behind the brand mark on both the splash and sign-in screens. */
function BackdropRings() {
  return (
    <>
      <View style={[s.ring, s.ringA]} />
      <View style={[s.ring, s.ringB]} />
      <View style={[s.ring, s.ringC]} />
    </>
  );
}

/** Minimal branded splash shown while the persisted auth session is loading. */
export function AuthSplash() {
  return (
    <LinearGradient colors={[colors.brand600, colors.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.splash}>
      <BackdropRings />
      <View style={s.logoBadge}>
        <Text style={s.logo}>🧭</Text>
      </View>
      <Text style={s.brandLight}>Wander</Text>
      <ActivityIndicator color="#fff" style={{ marginTop: 22 }} />
    </LinearGradient>
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
    <LinearGradient colors={[colors.brand600, colors.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.root}>
      <View style={s.hero}>
        <BackdropRings />
        <View style={s.logoBadge}>
          <Text style={s.logo}>🧭</Text>
        </View>
        <Text style={s.brandLight}>Wander</Text>
        <Text style={s.tagline}>Plan the trip. Capture the journey.</Text>
      </View>

      <View style={s.card}>
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
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  root: { flex: 1 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.16)' },
  ringA: { width: 260, height: 260 },
  ringB: { width: 380, height: 380 },
  ringC: { width: 500, height: 500 },
  logoBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  logo: { fontSize: 40 },
  brandLight: { fontSize: 34, fontWeight: '900', color: '#fff', letterSpacing: -1, marginTop: 16 },
  tagline: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 10, textAlign: 'center' },
  card: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 28,
    gap: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 8,
  },
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
