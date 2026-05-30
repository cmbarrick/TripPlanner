import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';

export function PlaceholderScreen({ title, emoji, phase, blurb }: { title: string; emoji: string; phase: string; blurb: string }) {
  return (
    <View style={s.root}>
      <View style={s.appbar}>
        <Text style={s.title}>{title}</Text>
      </View>
      <View style={s.center}>
        <Text style={{ fontSize: 52 }}>{emoji}</Text>
        <Text style={s.phase}>{phase}</Text>
        <Text style={s.blurb}>{blurb}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  appbar: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8 },
  phase: { marginTop: 14, fontSize: 12, fontWeight: '800', color: colors.brand, backgroundColor: colors.brand100, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, overflow: 'hidden' },
  blurb: { textAlign: 'center', color: colors.ink600, fontSize: 13, lineHeight: 19, marginTop: 6 },
});
