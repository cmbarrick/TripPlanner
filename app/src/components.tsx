import React from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, coverThemes, radius } from './theme';

export function Pill({ label, tone = 'teal' }: { label: string; tone?: 'teal' | 'orange' | 'warn' | 'ok' | 'danger' | 'neutral' }) {
  const map = {
    teal: { bg: colors.brand100, fg: colors.brand },
    orange: { bg: colors.accent100, fg: '#c2410c' },
    warn: { bg: '#fef3c7', fg: colors.warn },
    ok: { bg: '#dcfce7', fg: colors.ok },
    danger: { bg: '#fee2e2', fg: colors.danger },
    neutral: { bg: '#f1f5f9', fg: colors.ink600 },
  }[tone];
  return (
    <View style={[s.pill, { backgroundColor: map.bg }]}>
      <Text style={[s.pillText, { color: map.fg }]}>{label}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function TripCover({
  theme,
  title,
  subtitle,
  badge,
  faded,
  onPress,
}: {
  theme: string;
  title: string;
  subtitle: string;
  badge?: string;
  faded?: boolean;
  onPress?: () => void;
}) {
  const gradient = coverThemes[theme] ?? coverThemes.default;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.9 : faded ? 0.7 : 1 }]}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cover}>
        {badge ? (
          <View style={s.badge}>
            <Text style={s.badgeText}>{badge}</Text>
          </View>
        ) : null}
        <Text style={s.coverTitle}>{title}</Text>
        <Text style={s.coverSub}>{subtitle}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export type TabKey = 'trips' | 'calendar' | 'assistant' | 'profile';

const TABS: { key: TabKey; icon: string; label: string }[] = [
  { key: 'trips', icon: '🧭', label: 'Trips' },
  { key: 'calendar', icon: '🗓️', label: 'Calendar' },
  { key: 'assistant', icon: '✨', label: 'Assistant' },
  { key: 'profile', icon: '👤', label: 'Profile' },
];

export function TabBar({ active, onChange }: { active: TabKey; onChange: (k: TabKey) => void }) {
  return (
    <View style={s.tabbar}>
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <Pressable key={t.key} style={s.tab} onPress={() => onChange(t.key)}>
            <Text style={[s.tabIcon, { opacity: on ? 1 : 0.5 }]}>{t.icon}</Text>
            <Text style={[s.tabLabel, { color: on ? colors.brand : colors.ink400 }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  pillText: { fontSize: 10, fontWeight: '800' },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
  },
  cover: { height: 132, borderRadius: radius.lg, padding: 14, justifyContent: 'flex-end', overflow: 'hidden' },
  coverTitle: { color: '#fff', fontSize: 19, fontWeight: '800' },
  coverSub: { color: '#fff', fontSize: 12, opacity: 0.92, marginTop: 2 },
  badge: {
    position: 'absolute', top: 12, left: 12,
    backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  tabbar: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    height: 64, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line,
  },
  tab: { alignItems: 'center', gap: 3 },
  tabIcon: { fontSize: 22 },
  tabLabel: { fontSize: 10, fontWeight: '700' },
});
