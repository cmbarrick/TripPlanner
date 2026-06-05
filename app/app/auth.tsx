import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { completeWebSignIn } from '../src/auth/session';
import { colors } from '../src/theme';

// OAuth redirect target for the web full-page sign-in flow (/auth?code=...).
// It exchanges the authorization code, then sends the user back into the app.
export default function AuthCallbackRoute() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await completeWebSignIn();
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : 'Sign-in failed.');
          return;
        }
      }
      if (active) router.replace('/');
    })();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <View style={styles.root}>
      {error ? (
        <>
          <Text style={styles.title}>Sign-in failed</Text>
          <Text style={styles.message}>{error}</Text>
          <Text style={styles.link} onPress={() => router.replace('/')}>
            Go back
          </Text>
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={styles.message}>Finishing sign-in…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.bg,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  message: { marginTop: 12, color: colors.ink600, textAlign: 'center' },
  link: { marginTop: 16, color: colors.brand, fontWeight: '600' },
});
