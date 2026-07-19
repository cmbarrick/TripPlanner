import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius } from '../theme';

type Step = {
  icon: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: '🧭',
    title: 'Welcome to Wander',
    body: 'Plan every trip in one place — flights, stays, activities, and the ideas you haven’t booked yet.',
  },
  {
    icon: '✨',
    title: 'Plan with an AI assistant',
    body: 'Ask for a full itinerary or just "find me a walking tour on day 2" — the assistant edits your real trip and only recommends places it actually found.',
  },
  {
    icon: '🎙️',
    title: 'Capture the journey',
    body: 'Jot text, record a voice note, or snap a photo right on the itinerary. Wander will ask for microphone and photo access the first time you use each — only when you choose to.',
  },
];

/**
 * First-run only (gated by a persisted local flag in App.tsx — see `onboarded` state). Shown once
 * per install, before the sign-in gate, since it's device-level orientation rather than
 * account-level. Deliberately not a permission-request screen itself (no OS prompts fire here) —
 * just sets expectations before the cold `expo-audio`/`expo-image-picker` prompts a user would
 * otherwise hit unprompted on first tap of Record/Photo.
 */
export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <LinearGradient colors={[colors.brand600, colors.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.root}>
      <Pressable style={s.skip} onPress={onDone} hitSlop={8} accessibilityLabel="Skip onboarding">
        <Text style={s.skipText}>Skip</Text>
      </Pressable>

      <View style={s.hero}>
        <View style={s.logoBadge}>
          <Text style={s.logo}>{current.icon}</Text>
        </View>
        <Text style={s.title}>{current.title}</Text>
        <Text style={s.body}>{current.body}</Text>
      </View>

      <View style={s.card}>
        <View style={s.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[s.dot, i === step && s.dotOn]} />
          ))}
        </View>

        <Pressable
          style={s.nextBtn}
          onPress={() => (isLast ? onDone() : setStep((n) => n + 1))}
          accessibilityLabel={isLast ? 'Get started' : 'Next'}
        >
          <Text style={s.nextText}>{isLast ? 'Get started' : 'Next'}</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  skip: { position: 'absolute', top: 14, right: 18, zIndex: 1, padding: 8 },
  skipText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
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
  title: { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: -0.5, marginTop: 20, textAlign: 'center' },
  body: { fontSize: 14, color: 'rgba(255,255,255,0.88)', marginTop: 12, textAlign: 'center', lineHeight: 21 },
  card: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 28,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 8,
  },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.line },
  dotOn: { backgroundColor: colors.brand, width: 18 },
  nextBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 15,
    borderRadius: radius.md,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  nextText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
