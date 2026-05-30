import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Trip, ItineraryItem, ItineraryItemType } from '../types';
import { ItineraryItemInput } from '../api';
import { colors, radius, itemEmoji } from '../theme';
import { dayLabel } from '../format';
import { TimeField } from '../pickers';
import { ClockPref } from '../store/uiStore';

const TYPES: { key: ItineraryItemType; label: string }[] = [
  { key: 'Flight', label: 'Flight' },
  { key: 'Lodging', label: 'Stay' },
  { key: 'Activity', label: 'Activity' },
  { key: 'Food', label: 'Food' },
  { key: 'Transport', label: 'Transit' },
];

export function AddActivityScreen({
  trip,
  item,
  saving,
  serverError,
  onCancel,
  onSubmit,
  onDelete,
  clock = '12h',
}: {
  trip: Trip;
  item?: ItineraryItem;
  saving?: boolean;
  serverError?: string | null;
  onCancel: () => void;
  onSubmit: (dayId: string, input: ItineraryItemInput, originalDayId?: string) => void;
  onDelete?: () => void;
  clock?: ClockPref;
}) {
  const editing = !!item;
  const [type, setType] = useState<ItineraryItemType>(item?.type ?? 'Activity');
  const [title, setTitle] = useState(item?.title ?? '');
  const [place, setPlace] = useState(item?.locationName ?? '');
  const [dayId, setDayId] = useState(item?.dayId ?? trip.days[0]?.id ?? '');
  const [startTime, setStartTime] = useState<string | null>(item?.startTime ?? null);
  const [endTime, setEndTime] = useState<string | null>(item?.endTime ?? null);
  const [cost, setCost] = useState(item?.cost != null ? String(item.cost) : '');
  const [conf, setConf] = useState(item?.confirmationNo ?? '');
  const [link, setLink] = useState(item?.bookingUrl ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [error, setError] = useState('');

  const canSave = title.trim().length > 0 && dayId.length > 0;

  const handleSave = () => {
    if (!canSave) {
      setError('Add a title and pick a day.');
      return;
    }
    if (startTime && endTime && endTime < startTime) {
      setError('End time must be after the start time.');
      return;
    }
    const input: ItineraryItemInput = {
      type,
      title: title.trim(),
      locationName: place.trim() || null,
      latitude: item?.latitude ?? null,
      longitude: item?.longitude ?? null,
      startTime,
      endTime,
      cost: cost ? Number(cost) : null,
      currency: trip.currency,
      confirmationNo: conf.trim() || null,
      bookingUrl: normalizeUrl(link),
      notes: notes.trim() || null,
    };
    onSubmit(dayId, input, item?.dayId);
  };

  return (
    <View style={s.root}>
      <View style={s.appbar}>
        <Pressable style={s.iconBtn} onPress={onCancel} accessibilityLabel="Cancel">
          <Text style={{ fontSize: 16, color: colors.ink600 }}>✕</Text>
        </Pressable>
        <Text style={s.title}>{editing ? 'Edit item' : 'Add to itinerary'}</Text>
        <Pressable onPress={handleSave} disabled={saving} style={[s.save, { opacity: canSave && !saving ? 1 : 0.5 }]} accessibilityLabel="Save item">
          {saving ? <ActivityIndicator size="small" color={colors.brand} /> : <Text style={s.saveText}>Save</Text>}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Field label="Type">
          <View style={s.seg}>
            {TYPES.map((t) => {
              const on = t.key === type;
              return (
                <Pressable key={t.key} style={[s.opt, on && s.optOn]} onPress={() => setType(t.key)}>
                  <Text style={[s.optText, on && s.optTextOn]}>{itemEmoji[t.key]}</Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <Field label="Title">
          <TextInput
            style={s.control}
            placeholder="e.g. Belém Tower & Jerónimos"
            placeholderTextColor={colors.ink400}
            value={title}
            onChangeText={(t) => { setTitle(t); setError(''); }}
          />
        </Field>

        <Field label="Place">
          <TextInput
            style={s.control}
            placeholder="📍 Search a place"
            placeholderTextColor={colors.ink400}
            value={place}
            onChangeText={setPlace}
          />
        </Field>

        <Field label={editing ? 'Day (change to move across days)' : 'Day'}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {trip.days.map((d) => {
              const on = d.id === dayId;
              const lbl = dayLabel(d.date, d.dayNumber);
              return (
                <Pressable key={d.id} style={[s.dayChip, on && s.dayChipOn]} onPress={() => { setDayId(d.id); setError(''); }}>
                  <Text style={[s.dayChipText, on && s.dayChipTextOn]}>{lbl.d.replace('· ', '')}</Text>
                  <Text style={[s.dayChipSub, on && { color: '#d1fae5' }]}>{lbl.w}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Field>

        <View style={s.row}>
          <Field label="Start time" style={{ flex: 1 }}>
            <TimeField value={startTime} onChange={(t) => { setStartTime(t); setError(''); }} placeholder="Add start" accessibilityLabel="Start time" clock={clock} />
          </Field>
          <Field label="End time" style={{ flex: 1 }}>
            <TimeField value={endTime} onChange={(t) => { setEndTime(t); setError(''); }} placeholder="Add end" accessibilityLabel="End time" clock={clock} />
          </Field>
        </View>

        <View style={s.row}>
          <Field label={`Cost (${trip.currency})`} style={{ flex: 1 }}>
            <TextInput style={s.control} placeholder="0" placeholderTextColor={colors.ink400} value={cost} onChangeText={setCost} keyboardType="numeric" />
          </Field>
          <Field label="Confirmation #" style={{ flex: 1 }}>
            <TextInput style={s.control} placeholder="optional" placeholderTextColor={colors.ink400} value={conf} onChangeText={setConf} />
          </Field>
        </View>

        <Field label="Booking / confirmation link">
          <TextInput
            style={s.control}
            placeholder="https://getyourguide.com/…"
            placeholderTextColor={colors.ink400}
            value={link}
            onChangeText={setLink}
            autoCapitalize="none"
            keyboardType="url"
          />
        </Field>

        <Field label="Notes">
          <TextInput
            style={[s.control, { height: 70, textAlignVertical: 'top' }]}
            placeholder="Buy combined ticket online to skip the line…"
            placeholderTextColor={colors.ink400}
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </Field>

        {error ? <Text style={s.error}>{error}</Text> : null}
        {serverError ? <Text style={s.error}>{serverError}</Text> : null}

        {editing && onDelete ? (
          <Pressable style={s.delete} onPress={onDelete} accessibilityLabel="Delete item">
            <Text style={s.deleteText}>Delete item</Text>
          </Pressable>
        ) : null}
        <View style={{ height: 30 }} />
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

function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  appbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  title: { fontSize: 17, fontWeight: '800', color: colors.ink },
  iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  save: { backgroundColor: colors.brand100, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, minWidth: 60, alignItems: 'center' },
  saveText: { color: colors.brand, fontWeight: '800', fontSize: 13 },
  body: { paddingHorizontal: 16, paddingTop: 4 },
  label: { fontSize: 11, fontWeight: '700', color: colors.ink600, marginBottom: 5 },
  control: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 11, fontSize: 13, color: colors.ink },
  seg: { flexDirection: 'row', gap: 6 },
  opt: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  optOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  optText: { fontSize: 15, fontWeight: '700', color: colors.ink600 },
  optTextOn: { color: '#fff' },
  row: { flexDirection: 'row', gap: 10 },
  dayChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  dayChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayChipText: { fontSize: 12, fontWeight: '700', color: colors.ink },
  dayChipTextOn: { color: '#fff' },
  dayChipSub: { fontSize: 10, color: colors.ink400, marginTop: 2 },
  error: { color: colors.danger, fontSize: 12, fontWeight: '600', marginTop: 4 },
  delete: { marginTop: 18, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  deleteText: { color: colors.danger, fontWeight: '800', fontSize: 13 },
});
