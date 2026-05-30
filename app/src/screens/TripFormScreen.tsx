import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Trip } from '../types';
import { TripInput } from '../api';
import { colors, radius, coverThemes } from '../theme';
import { DateField, SelectField } from '../pickers';
import { timeZoneOptions, timeZoneLabel, guessTimeZone } from '../timezones';

const THEME_KEYS = ['lisbon', 'kyoto', 'alps', 'sicily', 'default'];
const CURRENCIES = ['EUR', 'USD', 'GBP', 'JPY', 'CHF'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function TripFormScreen({
  trip,
  saving,
  serverError,
  onCancel,
  onSubmit,
}: {
  trip?: Trip;
  saving: boolean;
  serverError?: string | null;
  onCancel: () => void;
  onSubmit: (input: TripInput) => void;
}) {
  const editing = !!trip;
  const [title, setTitle] = useState(trip?.title ?? '');
  const [destination, setDestination] = useState(trip?.destination ?? '');
  const [startDate, setStartDate] = useState(trip?.startDate ?? '');
  const [endDate, setEndDate] = useState(trip?.endDate ?? '');
  const [travelers, setTravelers] = useState(String(trip?.travelers ?? 1));
  const [currency, setCurrency] = useState(trip?.currency ?? 'EUR');
  const [cost, setCost] = useState(trip?.estimatedCost ? String(trip.estimatedCost) : '');
  const [coverTheme, setCoverTheme] = useState(trip?.coverTheme ?? 'lisbon');
  const [timeZoneId, setTimeZoneId] = useState(trip?.timeZoneId ?? guessTimeZone());
  const [error, setError] = useState('');

  const validate = (): TripInput | null => {
    if (!title.trim()) return fail('Add a trip title.');
    if (!destination.trim()) return fail('Add a destination.');
    if (!DATE_RE.test(startDate)) return fail('Pick a start date.');
    if (!DATE_RE.test(endDate)) return fail('Pick an end date.');
    if (endDate < startDate) return fail('End date must be on or after the start date.');
    const travelerCount = Number(travelers);
    if (!Number.isFinite(travelerCount) || travelerCount < 1) return fail('Travelers must be at least 1.');
    setError('');
    return {
      title: title.trim(),
      destination: destination.trim(),
      startDate,
      endDate,
      travelers: Math.floor(travelerCount),
      coverTheme,
      estimatedCost: cost ? Number(cost) || 0 : 0,
      currency,
      timeZoneId,
    };
  };

  const fail = (msg: string): null => {
    setError(msg);
    return null;
  };

  const handleSubmit = () => {
    const input = validate();
    if (input) onSubmit(input);
  };

  return (
    <View style={s.root}>
      <View style={s.appbar}>
        <Pressable style={s.iconBtn} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={{ fontSize: 16, color: colors.ink600 }}>✕</Text>
        </Pressable>
        <Text style={s.title}>{editing ? 'Edit trip' : 'New trip'}</Text>
        <Pressable
          onPress={handleSubmit}
          disabled={saving}
          style={[s.save, { opacity: saving ? 0.5 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Save trip"
        >
          {saving ? <ActivityIndicator size="small" color={colors.brand} /> : <Text style={s.saveText}>Save</Text>}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Field label="Title">
          <TextInput
            style={s.control}
            placeholder="e.g. Lisbon Getaway"
            placeholderTextColor={colors.ink400}
            value={title}
            onChangeText={(t) => { setTitle(t); setError(''); }}
          />
        </Field>

        <Field label="Destination">
          <TextInput
            style={s.control}
            placeholder="e.g. Lisbon, Portugal"
            placeholderTextColor={colors.ink400}
            value={destination}
            onChangeText={(t) => { setDestination(t); setError(''); }}
          />
        </Field>

        <View style={s.row}>
          <Field label="Start date" style={{ flex: 1 }}>
            <DateField
              value={startDate}
              onChange={(d) => {
                setStartDate(d);
                if (endDate && endDate < d) setEndDate(d);
                setError('');
              }}
              placeholder="Pick start"
              accessibilityLabel="Start date"
            />
          </Field>
          <Field label="End date" style={{ flex: 1 }}>
            <DateField
              value={endDate}
              onChange={(d) => { setEndDate(d); setError(''); }}
              placeholder="Pick end"
              accessibilityLabel="End date"
            />
          </Field>
        </View>

        <View style={s.row}>
          <Field label="Travelers" style={{ flex: 1 }}>
            <TextInput
              style={s.control}
              placeholder="1"
              placeholderTextColor={colors.ink400}
              value={travelers}
              onChangeText={(t) => { setTravelers(t); setError(''); }}
              keyboardType="numeric"
            />
          </Field>
          <Field label="Est. cost" style={{ flex: 1 }}>
            <TextInput
              style={s.control}
              placeholder="0"
              placeholderTextColor={colors.ink400}
              value={cost}
              onChangeText={setCost}
              keyboardType="numeric"
            />
          </Field>
        </View>

        <Field label="Currency">
          <View style={s.seg}>
            {CURRENCIES.map((c) => {
              const on = c === currency;
              return (
                <Pressable key={c} style={[s.opt, on && s.optOn]} onPress={() => setCurrency(c)}>
                  <Text style={[s.optText, on && s.optTextOn]}>{c}</Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <Field label="Time zone (for reminders)">
          <SelectField
            value={timeZoneId}
            options={timeZoneOptions(timeZoneId)}
            onChange={setTimeZoneId}
            labelFor={timeZoneLabel}
            accessibilityLabel="Trip time zone"
          />
        </Field>

        <Field label="Cover">
          <View style={s.seg}>
            {THEME_KEYS.map((key) => {
              const on = key === coverTheme;
              const gradient = coverThemes[key] ?? coverThemes.default;
              return (
                <Pressable key={key} style={[s.swatch, { borderColor: on ? colors.brand : colors.line, borderWidth: on ? 2 : 1 }]} onPress={() => setCoverTheme(key)}>
                  <View style={[s.swatchFill, { backgroundColor: gradient[0] }]} />
                  <Text style={[s.swatchText, on && { color: colors.brand }]}>{key}</Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        {error ? <Text style={s.error}>{error}</Text> : null}
        {serverError ? <Text style={s.error}>{serverError}</Text> : null}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: any }) {
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      <Text style={s.label}>{label}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  appbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  title: { fontSize: 17, fontWeight: '800', color: colors.ink },
  iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  save: { backgroundColor: colors.brand100, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, minWidth: 64, alignItems: 'center' },
  saveText: { color: colors.brand, fontWeight: '800', fontSize: 13 },
  body: { paddingHorizontal: 16, paddingTop: 4 },
  label: { fontSize: 11, fontWeight: '700', color: colors.ink600, marginBottom: 5 },
  control: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 11, fontSize: 13, color: colors.ink },
  row: { flexDirection: 'row', gap: 10 },
  seg: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  opt: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.sm, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  optOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  optText: { fontSize: 11, fontWeight: '700', color: colors.ink600 },
  optTextOn: { color: '#fff' },
  swatch: { alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.white },
  swatchFill: { width: 28, height: 16, borderRadius: 6 },
  swatchText: { fontSize: 10, fontWeight: '700', color: colors.ink600 },
  error: { color: colors.danger, fontSize: 12, fontWeight: '600', marginTop: 4 },
});
