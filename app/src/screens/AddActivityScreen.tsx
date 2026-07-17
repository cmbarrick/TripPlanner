import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Trip, ItineraryItem, ItineraryItemType, ItineraryItemStatus } from '../types';
import { ItineraryItemInput, searchPlaces, getPlaceDetails } from '../api';
import { PlaceSearchField, SelectedPlace } from '../PlaceSearchField';
import { colors, radius, itemEmoji } from '../theme';
import { dayLabel } from '../format';
import { TimeField } from '../pickers';
import { ClockPref } from '../store/uiStore';
import {
  useTripNotesQuery,
  useCreateNoteMutation,
  useDeleteNoteMutation,
  useUpdateNoteMutation,
} from '../queries/notes';
import { VoiceControls } from '../voice/VoiceControls';
import { PhotoControls } from '../media/PhotoControls';
import { NoteCard } from '../notes/NoteCard';
import { ReflectFlow, isEventPast } from '../prompts/ReflectFlow';
import { HourlyWeatherStrip } from '../weather/HourlyWeatherStrip';

const TYPES: { key: ItineraryItemType; label: string }[] = [
  { key: 'Flight', label: 'Flight' },
  { key: 'Lodging', label: 'Stay' },
  { key: 'Activity', label: 'Activity' },
  { key: 'Food', label: 'Food' },
  { key: 'Transport', label: 'Transit' },
];

const STATUSES: { key: ItineraryItemStatus; label: string }[] = [
  { key: 'Confirmed', label: 'Confirmed' },
  { key: 'Tentative', label: 'Tentative' },
  { key: 'Wishlist', label: 'Wishlist' },
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
  onSubmit: (dayId: string | null, input: ItineraryItemInput, originalDayId?: string | null) => void;
  onDelete?: () => void;
  clock?: ClockPref;
}) {
  const editing = !!item;
  const [type, setType] = useState<ItineraryItemType>(item?.type ?? 'Activity');
  const [status, setStatus] = useState<ItineraryItemStatus>(item?.status ?? 'Confirmed');
  const [title, setTitle] = useState(item?.title ?? '');
  const [flightNumber, setFlightNumber] = useState(item?.flightNumber ?? '');
  const [place, setPlace] = useState(item?.locationName ?? '');
  const [address, setAddress] = useState<string | null>(item?.address ?? null);
  const [placeId, setPlaceId] = useState<string | null>(item?.placeId ?? null);
  const [latitude, setLatitude] = useState<number | null>(item?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(item?.longitude ?? null);
  // null = the trip backlog ("Ideas", no date).
  const [dayId, setDayId] = useState<string | null>(item ? item.dayId : trip.days[0]?.id ?? null);
  const [startTime, setStartTime] = useState<string | null>(item?.startTime ?? null);
  const [endTime, setEndTime] = useState<string | null>(item?.endTime ?? null);
  const [cost, setCost] = useState(item?.cost != null ? String(item.cost) : '');
  const [conf, setConf] = useState(item?.confirmationNo ?? '');
  const [link, setLink] = useState(item?.bookingUrl ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [error, setError] = useState('');
  const [resolving, setResolving] = useState(false);

  const scheduled = dayId != null;
  const canSave = title.trim().length > 0;
  const busy = saving || resolving;

  // Bias place search toward the trip area: use the first already-located stop's coordinates.
  const proximity = useMemo(() => {
    const located = [
      ...trip.days.flatMap((d) => d.items),
      ...(trip.unscheduledItems ?? []),
    ].find((i) => i.latitude != null && i.longitude != null);
    return located ? { lat: located.latitude as number, lng: located.longitude as number } : null;
  }, [trip]);

  const handleSave = async () => {
    if (!canSave) {
      setError('Add a title.');
      return;
    }
    if (scheduled && startTime && endTime && endTime < startTime) {
      setError('End time must be after the start time.');
      return;
    }

    // A place typed (or pasted) without choosing a suggestion has no coordinates, so it never
    // lands on the map / gets per-item weather. Best-effort forward-geocode it on save so those
    // items still get pinned. Falls back silently to saving without coordinates.
    let resolvedAddress = address;
    let resolvedPlaceId = placeId;
    let resolvedLat = latitude;
    let resolvedLng = longitude;
    const placeName = place.trim();
    if (placeName && resolvedLat == null) {
      try {
        setResolving(true);
        const session = `save-${Date.now()}`;
        const [top] = await searchPlaces(placeName, 1, {
          sessionToken: session,
          proximityLat: proximity?.lat ?? null,
          proximityLng: proximity?.lng ?? null,
        });
        if (top) {
          // Search Box suggestions carry no coordinates — resolve the top match via retrieve.
          const detail = await getPlaceDetails(top.placeId, session);
          if (detail) {
            resolvedLat = detail.latitude;
            resolvedLng = detail.longitude;
            resolvedAddress = resolvedAddress ?? detail.address ?? top.address ?? null;
            resolvedPlaceId = resolvedPlaceId ?? top.placeId;
          }
        }
      } catch {
        // Geocoding unavailable — save the item as-is (no coordinates).
      } finally {
        setResolving(false);
      }
    }

    const input: ItineraryItemInput = {
      type,
      status,
      title: title.trim(),
      flightNumber: type === 'Flight' ? (flightNumber.trim().toUpperCase() || null) : null,
      locationName: placeName || null,
      address: resolvedAddress,
      placeId: resolvedPlaceId,
      latitude: resolvedLat,
      longitude: resolvedLng,
      // Times only make sense for a scheduled (dated) item.
      startTime: scheduled ? startTime : null,
      endTime: scheduled ? endTime : null,
      cost: cost ? Number(cost) : null,
      currency: trip.currency,
      confirmationNo: conf.trim() || null,
      bookingUrl: normalizeUrl(link),
      notes: notes.trim() || null,
    };
    onSubmit(dayId, input, item ? item.dayId : undefined);
  };

  return (
    <View style={s.root}>
      <View style={s.appbar}>
        <Pressable style={s.iconBtn} onPress={onCancel} accessibilityLabel="Cancel">
          <Text style={{ fontSize: 16, color: colors.ink600 }}>✕</Text>
        </Pressable>
        <Text style={s.title}>{editing ? 'Edit item' : 'Add to itinerary'}</Text>
        <Pressable onPress={handleSave} disabled={busy} style={[s.save, { opacity: canSave && !busy ? 1 : 0.5 }]} accessibilityLabel="Save item">
          {busy ? <ActivityIndicator size="small" color={colors.brand} /> : <Text style={s.saveText}>Save</Text>}
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

        <Field label="Status">
          <View style={s.seg}>
            {STATUSES.map((st) => {
              const on = st.key === status;
              return (
                <Pressable key={st.key} style={[s.statusOpt, on && s.optOn]} onPress={() => setStatus(st.key)}>
                  <Text style={[s.statusText, on && s.optTextOn]}>{st.label}</Text>
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

        <Field label="Place" style={s.placeField}>
          <PlaceSearchField
            proximity={proximity}
            value={place}
            onChange={(text) => {
              setPlace(text);
              // Typing manually after a selection clears the structured data.
              setPlaceId(null);
              setAddress(null);
              setLatitude(null);
              setLongitude(null);
            }}
            onSelectPlace={(p: SelectedPlace) => {
              setPlace(p.name);
              setAddress(p.address ?? null);
              setPlaceId(p.placeId);
              setLatitude(p.latitude ?? null);
              setLongitude(p.longitude ?? null);
              // Auto-fill title if still empty.
              if (!title.trim()) setTitle(p.name);
            }}
            onClear={() => {
              setAddress(null);
              setPlaceId(null);
              setLatitude(null);
              setLongitude(null);
            }}
          />
          {latitude != null ? (
            <Text style={s.placeHint}>
              📍 Pinned to map{address ? ` · ${address}` : ''}
            </Text>
          ) : place.trim() ? (
            <Text style={s.placeHintMuted}>
              Pick a suggestion to pin this on the map (we'll also try to locate it on save).
            </Text>
          ) : null}
        </Field>

        <Field label={editing ? 'Day (change to move, or Ideas to unschedule)' : 'Day'}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Pressable style={[s.dayChip, !scheduled && s.dayChipOn]} onPress={() => { setDayId(null); setError(''); }}>
              <Text style={[s.dayChipText, !scheduled && s.dayChipTextOn]}>💡 Ideas</Text>
              <Text style={[s.dayChipSub, !scheduled && { color: '#d1fae5' }]}>no date</Text>
            </Pressable>
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

        {scheduled ? (
          <View style={s.row}>
            <Field label="Start time" style={{ flex: 1 }}>
              <TimeField value={startTime} onChange={(t) => { setStartTime(t); setError(''); }} placeholder="Add start" accessibilityLabel="Start time" clock={clock} />
            </Field>
            <Field label="End time" style={{ flex: 1 }}>
              <TimeField value={endTime} onChange={(t) => { setEndTime(t); setError(''); }} placeholder="Add end" accessibilityLabel="End time" clock={clock} />
            </Field>
          </View>
        ) : null}

        {type === 'Flight' ? (
          <Field label="Flight number">
            <TextInput
              style={s.control}
              placeholder="e.g. BA 123"
              placeholderTextColor={colors.ink400}
              value={flightNumber}
              onChangeText={(t) => setFlightNumber(t.toUpperCase())}
              autoCapitalize="characters"
              accessibilityLabel="Flight number"
            />
          </Field>
        ) : null}

        <View style={s.row}>
          <Field label={`Cost (${trip.currency})`} style={{ flex: 1 }}>
            <TextInput style={s.control} placeholder="0" placeholderTextColor={colors.ink400} value={cost} onChangeText={setCost} keyboardType="numeric" />
          </Field>
          <Field label={type === 'Flight' ? 'Booking ref' : 'Confirmation #'} style={{ flex: 1 }}>
            <TextInput style={s.control} placeholder="optional" placeholderTextColor={colors.ink400} value={conf} onChangeText={setConf} />
          </Field>
        </View>

        <Field label={type === 'Flight' ? 'Airline booking link' : 'Booking / confirmation link'}>
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

        {editing && item ? <HourlyWeatherStrip trip={trip} item={item} /> : null}

        {editing && item ? <EventJournal trip={trip} item={item} /> : null}

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

/**
 * Journal-as-you-go: text notes anchored to this specific itinerary event. The itinerary timeline
 * doubles as the journal, so capture happens right where the event lives. (Voice + photos arrive in
 * later Phase 4 slices.)
 */
function EventJournal({ trip, item }: { trip: Trip; item: ItineraryItem }) {
  const tripId = trip.id;
  const past = isEventPast(trip, item);
  const { data: notesData, isLoading } = useTripNotesQuery(tripId);
  const createNote = useCreateNoteMutation(tripId);
  const deleteNote = useDeleteNoteMutation(tripId);
  const updateNote = useUpdateNoteMutation(tripId);
  const [draft, setDraft] = useState('');

  const notes = (notesData?.data ?? []).filter(
    (n) => n.scope === 'Event' && n.targetId === item.id && !n.deletedAt,
  );

  const add = () => {
    const body = draft.trim();
    if (!body || createNote.isPending) return;
    createNote.mutate(
      { scope: 'Event', targetId: item.id, kind: 'Text', bodyText: body },
      { onSuccess: () => setDraft('') },
    );
  };

  return (
    <View style={s.journal}>
      <View style={s.journalHead}>
        <Text style={s.journalTitle}>📝 Journal</Text>
        {notes.length > 0 ? <Text style={s.journalCount}>{notes.length}</Text> : null}
      </View>
      <Text style={s.journalHint}>Capture how this {item.type.toLowerCase()} went — saved against this event.</Text>

      {past ? (
        <ReflectFlow
          tripId={tripId}
          scope="Event"
          targetId={item.id}
          eventType={item.type}
          prominent
          ctaLabel={`How was ${item.title?.trim() || item.type.toLowerCase()}?`}
        />
      ) : null}

      <View style={s.journalAddRow}>
        <TextInput
          style={[s.control, s.journalInput]}
          placeholder="Add a journal entry…"
          placeholderTextColor={colors.ink400}
          value={draft}
          onChangeText={setDraft}
          multiline
          accessibilityLabel="New journal entry"
        />
        <Pressable
          style={[s.journalAddBtn, (!draft.trim() || createNote.isPending) && { opacity: 0.5 }]}
          onPress={add}
          disabled={!draft.trim() || createNote.isPending}
          accessibilityLabel="Save journal entry"
        >
          {createNote.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.journalAddText}>Add</Text>}
        </Pressable>
      </View>

      {createNote.isError ? <Text style={s.error}>Couldn't save the note. Try again.</Text> : null}

      <VoiceControls tripId={tripId} scope="Event" targetId={item.id} />
      <PhotoControls tripId={tripId} scope="Event" targetId={item.id} />
      {!past ? (
        <ReflectFlow tripId={tripId} scope="Event" targetId={item.id} eventType={item.type} />
      ) : null}

      {isLoading ? (
        <Text style={s.journalEmpty}>Loading…</Text>
      ) : notes.length === 0 ? (
        <Text style={s.journalEmpty}>No entries yet.</Text>
      ) : (
        notes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            tripId={tripId}
            onDelete={() => deleteNote.mutate(note.id)}
            onEdit={(bodyText) => updateNote.mutate({ noteId: note.id, bodyText, version: note.version })}
            savingEdit={updateNote.isPending && updateNote.variables?.noteId === note.id}
            editError={
              updateNote.isError && updateNote.variables?.noteId === note.id
                ? (updateNote.error as Error).message
                : null
            }
          />
        ))
      )}
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
  // Keep the Place field (and its absolutely-positioned suggestions dropdown) above the
  // form fields that follow it (Day selector, Start time) so results aren't painted behind them.
  placeField: { zIndex: 10, position: 'relative' },
  placeHint: { fontSize: 11, color: colors.brand, marginTop: 5 },
  placeHintMuted: { fontSize: 11, color: colors.ink400, marginTop: 5 },
  seg: { flexDirection: 'row', gap: 6 },
  opt: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  optOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  optText: { fontSize: 15, fontWeight: '700', color: colors.ink600 },
  optTextOn: { color: '#fff' },
  statusOpt: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  statusText: { fontSize: 12, fontWeight: '700', color: colors.ink600 },
  row: { flexDirection: 'row', gap: 10 },
  dayChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  dayChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayChipText: { fontSize: 12, fontWeight: '700', color: colors.ink },
  dayChipTextOn: { color: '#fff' },
  dayChipSub: { fontSize: 10, color: colors.ink400, marginTop: 2 },
  error: { color: colors.danger, fontSize: 12, fontWeight: '600', marginTop: 4 },
  delete: { marginTop: 18, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  deleteText: { color: colors.danger, fontWeight: '800', fontSize: 13 },
  journal: { marginTop: 18, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 16 },
  journalHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  journalTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  journalCount: { fontSize: 11, fontWeight: '800', color: colors.brand, backgroundColor: colors.brand100, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  journalHint: { fontSize: 11, color: colors.ink400, marginTop: 2, marginBottom: 10 },
  journalAddRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  journalInput: { flex: 1, minHeight: 44, maxHeight: 110, textAlignVertical: 'top' },
  journalAddBtn: { backgroundColor: colors.brand, paddingHorizontal: 16, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', minWidth: 56 },
  journalAddText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  journalEmpty: { fontSize: 12, color: colors.ink400, marginTop: 12 },
});
