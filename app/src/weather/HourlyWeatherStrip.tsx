import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Trip, ItineraryItem } from '../types';
import { useItemHourlyWeatherQuery } from '../queries/weather';
import { useUiStore } from '../store/uiStore';
import { formatClock, formatTemp, wmoEmoji } from '../format';
import { colors, radius } from '../theme';

/**
 * Hourly forecast for a single located, dated itinerary stop. Shown on the item detail/edit
 * screen so a traveler can see "🌦️ 14°C at 2 PM" for the event's location and day (architecture
 * §7). Renders nothing for unlocated or undated items (no coordinates / no day → no hourly).
 */
export function HourlyWeatherStrip({ trip, item }: { trip: Trip; item: ItineraryItem }) {
  const { unit, clock } = useUiStore();

  const day = trip.days.find((d) => d.id === item.dayId);
  const located = item.latitude != null && item.longitude != null;
  const enabled = located && day != null;

  const { data, isLoading } = useItemHourlyWeatherQuery(trip.id, item.id, enabled);

  if (!enabled) return null;

  // Event's hour (0–23) so we can highlight the matching chip.
  const eventHour = item.startTime ? Number(item.startTime.slice(0, 2)) : null;

  if (isLoading) {
    return (
      <View style={s.wrap}>
        <View style={s.head}>
          <Text style={s.title}>🕐 Hourly forecast</Text>
          <ActivityIndicator size="small" color={colors.brand} />
        </View>
      </View>
    );
  }

  const hours = data?.hours ?? [];
  if (hours.length === 0) return null;

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={s.title}>🕐 Hourly forecast</Text>
        {data?.isClimateSummary ? (
          <Text style={s.summaryTag}>typical for this date</Text>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {hours.map((h) => {
          const hh = Number(h.time.slice(11, 13));
          const isEventHour = eventHour != null && hh === eventHour;
          return (
            <View key={h.time} style={[s.chip, isEventHour && s.chipOn]}>
              <Text style={[s.hourText, isEventHour && s.textOn]}>
                {formatClock(`${String(hh).padStart(2, '0')}:00`, clock)}
              </Text>
              <Text style={s.emoji}>{wmoEmoji(h.weatherCode)}</Text>
              <Text style={[s.tempText, isEventHour && s.textOn]}>{formatTemp(h.tempC, unit)}</Text>
              {h.precipitationProbability != null && h.precipitationProbability >= 10 ? (
                <Text style={[s.precipText, isEventHour && s.textOnMuted]}>
                  💧{h.precipitationProbability}%
                </Text>
              ) : (
                <Text style={s.precipText}> </Text>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 11, fontWeight: '700', color: colors.ink600 },
  summaryTag: { fontSize: 10, color: colors.ink400, fontStyle: 'italic' },
  row: { gap: 6, paddingRight: 4 },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 56,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  hourText: { fontSize: 10, fontWeight: '700', color: colors.ink600 },
  emoji: { fontSize: 16, marginVertical: 2 },
  tempText: { fontSize: 12, fontWeight: '800', color: colors.ink },
  precipText: { fontSize: 9, color: colors.ink400, marginTop: 1 },
  textOn: { color: '#fff' },
  textOnMuted: { color: '#e0f2fe' },
});
