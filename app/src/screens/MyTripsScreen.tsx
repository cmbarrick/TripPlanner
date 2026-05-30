import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TextInput, Pressable } from 'react-native';
import { Trip } from '../types';
import { TripCover } from '../components';
import { colors, radius } from '../theme';
import { dateRange, countdown } from '../format';
import { buildTripsView, TripSort } from '../trips-view';

const SORTS: { key: TripSort; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'name', label: 'Name' },
];

export function MyTripsScreen({
  trips,
  loading,
  error,
  live,
  onOpenTrip,
  onCreateTrip,
}: {
  trips: Trip[];
  loading: boolean;
  error?: boolean;
  live: boolean;
  onOpenTrip: (id: string) => void;
  onCreateTrip?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TripSort>('date');

  const { upcoming, past } = useMemo(
    () => buildTripsView(trips, { query, sort }),
    [trips, query, sort]
  );

  const hasTrips = trips.length > 0;
  const hasResults = upcoming.length > 0 || past.length > 0;

  return (
    <View style={s.root}>
      <View style={s.appbar}>
        <View>
          <Text style={s.title}>My Trips</Text>
          <Text style={s.sub}>
            {upcoming.length} upcoming · {past.length} past
          </Text>
        </View>
      </View>

      {hasTrips ? (
        <View style={s.controls}>
          <View style={s.searchBox}>
            <Text style={{ fontSize: 14 }}>🔍</Text>
            <TextInput
              style={s.searchInput}
              placeholder="Search trips or destinations"
              placeholderTextColor={colors.ink400}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              accessibilityLabel="Search trips"
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
                <Text style={{ color: colors.ink400, fontSize: 14 }}>✕</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={s.seg}>
            {SORTS.map((o) => {
              const on = o.key === sort;
              return (
                <Pressable
                  key={o.key}
                  style={[s.segOpt, on && s.segOptOn]}
                  onPress={() => setSort(o.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Sort by ${o.label}`}
                >
                  <Text style={[s.segText, on && s.segTextOn]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {!live ? (
        <View style={s.banner}>
          <Text style={s.bannerText}>Showing demo data — start the API to go live</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : error ? (
        <View style={s.center}>
          <Text style={s.stateEmoji}>⚠️</Text>
          <Text style={s.stateTitle}>Couldn't load your trips</Text>
          <Text style={s.stateSub}>Check the API connection and try again.</Text>
        </View>
      ) : !hasTrips ? (
        <View style={s.center}>
          <Text style={s.stateEmoji}>🧭</Text>
          <Text style={s.stateTitle}>No trips yet</Text>
          <Text style={s.stateSub}>Tap + to plan your first adventure.</Text>
        </View>
      ) : !hasResults ? (
        <View style={s.center}>
          <Text style={s.stateEmoji}>🔍</Text>
          <Text style={s.stateTitle}>No matches</Text>
          <Text style={s.stateSub}>No trips match “{query.trim()}”.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {upcoming.length > 0 ? <Text style={s.section}>Upcoming</Text> : null}
          {upcoming.map((t) => (
            <View key={t.id} style={{ marginBottom: 14 }}>
              <TripCover
                theme={t.coverTheme}
                title={t.title}
                subtitle={`${dateRange(t.startDate, t.endDate)} · ${t.travelers === 1 ? 'Solo' : `${t.travelers} travelers`}`}
                badge={`${countdown(t.startDate)} · ${t.nights} nights`}
                onPress={() => onOpenTrip(t.id)}
              />
            </View>
          ))}
          {past.length > 0 ? <Text style={s.section}>Past</Text> : null}
          {past.map((t) => (
            <View key={t.id} style={{ marginBottom: 14 }}>
              <TripCover
                theme={t.coverTheme}
                title={t.title}
                subtitle={dateRange(t.startDate, t.endDate)}
                badge="Past"
                faded
                onPress={() => onOpenTrip(t.id)}
              />
            </View>
          ))}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      <Pressable style={s.fab} onPress={onCreateTrip} accessibilityRole="button" accessibilityLabel="Create trip">
        <Text style={{ color: '#fff', fontSize: 28, marginTop: -2 }}>+</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  appbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  sub: { fontSize: 12, color: colors.ink400, marginTop: 2 },
  controls: { paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 10, height: 40 },
  searchInput: { flex: 1, fontSize: 13, color: colors.ink, paddingVertical: 0 },
  seg: { flexDirection: 'row', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, overflow: 'hidden' },
  segOpt: { paddingHorizontal: 12, height: 40, justifyContent: 'center' },
  segOptOn: { backgroundColor: colors.brand },
  segText: { fontSize: 12, fontWeight: '700', color: colors.ink600 },
  segTextOn: { color: '#fff' },
  banner: { marginHorizontal: 16, marginBottom: 4, backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  bannerText: { color: '#c2410c', fontSize: 11, fontWeight: '600' },
  body: { paddingHorizontal: 16, paddingTop: 6 },
  section: { fontSize: 13, fontWeight: '800', color: colors.ink600, marginBottom: 8, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  stateEmoji: { fontSize: 34, marginBottom: 8 },
  stateTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 4 },
  stateSub: { fontSize: 13, color: colors.ink400, textAlign: 'center' },
  fab: { position: 'absolute', right: 18, bottom: 18, width: 56, height: 56, borderRadius: 18, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: '#0f172a', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
});
