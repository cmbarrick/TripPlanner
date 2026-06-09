import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '../theme';
import { useAiStatusQuery } from '../queries/ai';

export function AssistantScreen() {
  const statusQuery = useAiStatusQuery();
  const status = statusQuery.data;

  return (
    <View style={s.root}>
      <View style={s.appbar}>
        <Text style={s.title}>Assistant</Text>
        {status?.enabled ? (
          <Text style={s.sub}>AI planning is ready</Text>
        ) : (
          <Text style={s.sub}>Manual planning always works</Text>
        )}
      </View>

      <View style={s.center}>
        <Text style={s.emoji}>✨</Text>

        {statusQuery.isLoading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 16 }} />
        ) : status?.enabled ? (
          <>
            <Text style={s.phase}>Phase 5 · in progress</Text>
            <Text style={s.blurb}>
              Chat and itinerary generation are coming next. You can keep planning trips manually on the Trips tab.
            </Text>
            <Text style={s.quota}>
              Daily AI budget: {status.tokensRemainingToday.toLocaleString()} /{' '}
              {status.dailyTokenLimit.toLocaleString()} tokens left
            </Text>
          </>
        ) : (
          <>
            <Text style={s.phase}>AI not configured</Text>
            <Text style={s.blurb}>
              This server has no Azure OpenAI key yet. Wander is fully usable without AI — add activities, maps, and
              notes as usual.
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  appbar: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  sub: { fontSize: 13, color: colors.ink600, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8 },
  emoji: { fontSize: 52 },
  phase: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: '800',
    color: colors.brand,
    backgroundColor: colors.brand100,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  blurb: { textAlign: 'center', color: colors.ink600, fontSize: 13, lineHeight: 19, marginTop: 6 },
  quota: { textAlign: 'center', color: colors.ink400, fontSize: 11, marginTop: 12 },
});
