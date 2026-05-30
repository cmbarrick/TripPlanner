import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Trip, Day, ItineraryItem } from '../types';
import { Card, Pill } from '../components';
import { colors, radius, itemAccent, itemEmoji } from '../theme';
import { formatClock, fmtMoney, parseDate, weatherEmoji, formatTemp } from '../format';
import { detectConflicts, sortByTime, timeToMinutes } from '../itinerary';
import { ClockPref } from '../store/uiStore';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DOW_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Mode = 'day' | 'multi' | 'agenda';

export function CalendarScreen({
  trips,
  unit = 'F',
  clock = '12h',
  onEditItem,
}: {
  trips: Trip[];
  unit?: 'F' | 'C';
  clock?: ClockPref;
  onEditItem?: (tripId: string, item: ItineraryItem) => void;
}) {
  const now = Date.now();
  const sorted = [...trips].sort((a, b) => parseDate(a.startDate).getTime() - parseDate(b.startDate).getTime());
  const defaultTrip = sorted.find((t) => parseDate(t.endDate).getTime() >= now) ?? sorted[0];

  const [tripId, setTripId] = useState(defaultTrip?.id ?? '');
  const [mode, setMode] = useState<Mode>('day');
  const trip = trips.find((t) => t.id === tripId) ?? defaultTrip;

  const [selectedDayId, setSelectedDayId] = useState(trip?.days[0]?.id ?? '');
  const selectedDay = trip?.days.find((d) => d.id === selectedDayId) ?? trip?.days[0];

  const monthLabel = trip ? `${MONTHS[parseDate(trip.startDate).getMonth()]} ${parseDate(trip.startDate).getFullYear()}` : '';

  const agenda = useMemo(() => (selectedDay ? sortByTime(selectedDay.items) : []), [selectedDay]);
  const conflicts = useMemo(() => detectConflicts(agenda), [agenda]);

  if (!trip) {
    return (
      <View style={s.root}>
        <View style={s.appbar}><Text style={s.title}>Calendar</Text></View>
        <View style={s.center}><Text style={{ color: colors.ink600 }}>No trips yet.</Text></View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <View style={s.appbarRow}>
        <View>
          <Text style={s.title}>Calendar</Text>
          <Text style={s.sub}>{monthLabel} · {trip.destination.split(',')[0]}</Text>
        </View>
        <View style={s.modeSeg}>
          {(['day', 'multi', 'agenda'] as Mode[]).map((m) => {
            const on = m === mode;
            const label = m === 'day' ? 'Day' : m === 'multi' ? 'Week' : 'Agenda';
            return (
              <Pressable key={m} style={[s.modeOpt, on && s.modeOptOn]} onPress={() => setMode(m)}>
                <Text style={[s.modeText, on && s.modeTextOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {trips.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.switcher} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {sorted.map((t) => {
            const on = t.id === trip.id;
            return (
              <Pressable key={t.id} style={[s.tripChip, on && s.tripChipOn]} onPress={() => { setTripId(t.id); setSelectedDayId(t.days[0]?.id ?? ''); }}>
                <Text style={[s.tripChipText, on && { color: '#fff' }]}>{t.destination.split(',')[0]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {mode === 'agenda' ? (
        <AgendaView trip={trip} clock={clock} onEditItem={onEditItem} />
      ) : mode === 'multi' ? (
        <MultiDayView trip={trip} unit={unit} clock={clock} onEditItem={onEditItem} />
      ) : (
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          <Card style={{ marginBottom: 14 }}>
            <View style={s.weekRow}>
              {DOW.map((d) => <Text key={d} style={s.dow}>{d[0]}</Text>)}
            </View>
            <DayGrid trip={trip} selectedDayId={selectedDay?.id} onSelect={setSelectedDayId} />
          </Card>

          <Text style={s.agendaHead}>{selectedDay ? formatFullDate(selectedDay.date) : ''}</Text>

          {agenda.length === 0 ? (
            <Card><Text style={{ color: colors.ink600, fontSize: 13 }}>Nothing planned this day.</Text></Card>
          ) : (
            agenda.map((item) => {
              const conflict = conflicts.has(item.id);
              return (
                <Pressable key={item.id} style={s.slot} onPress={() => onEditItem?.(trip.id, item)} disabled={!onEditItem} accessibilityLabel={`Edit ${item.title}`}>
                  <Text style={s.hr}>{formatClock(item.startTime, clock) || '—'}</Text>
                  <View style={[s.ev, { borderLeftColor: conflict ? colors.danger : (itemAccent[item.type] ?? colors.brand) }, conflict && s.evConflict]}>
                    <View style={s.evHead}>
                      <Text style={s.evTitle}>{item.title}</Text>
                      {conflict ? <Pill label="Overlap" tone="danger" /> : null}
                    </View>
                    <Text style={s.evSub}>
                      {item.locationName ?? ''}{item.cost != null ? ` · ${fmtMoney(item.cost, item.currency)}` : ''}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ---------- Agenda (whole-trip list) ----------

function AgendaView({ trip, clock, onEditItem }: { trip: Trip; clock: ClockPref; onEditItem?: (tripId: string, item: ItineraryItem) => void }) {
  const daysWithItems = trip.days.filter((d) => d.items.length > 0);
  return (
    <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      {daysWithItems.length === 0 ? (
        <Card style={{ marginTop: 8 }}><Text style={{ color: colors.ink600, fontSize: 13 }}>Nothing planned across this trip yet.</Text></Card>
      ) : (
        daysWithItems.map((day) => {
          const conflicts = detectConflicts(day.items);
          return (
            <View key={day.id} style={{ marginBottom: 6 }}>
              <Text style={s.agendaDay}>{formatFullDate(day.date)}</Text>
              {sortByTime(day.items).map((item) => {
                const conflict = conflicts.has(item.id);
                return (
                  <Pressable key={item.id} style={s.slot} onPress={() => onEditItem?.(trip.id, item)} disabled={!onEditItem} accessibilityLabel={`Edit ${item.title}`}>
                    <Text style={s.hr}>{formatClock(item.startTime, clock) || '—'}</Text>
                    <View style={[s.ev, { borderLeftColor: conflict ? colors.danger : (itemAccent[item.type] ?? colors.brand) }, conflict && s.evConflict]}>
                      <View style={s.evHead}>
                        <Text style={s.evTitle}>{itemEmoji[item.type]} {item.title}</Text>
                        {conflict ? <Pill label="Overlap" tone="danger" /> : null}
                      </View>
                      <Text style={s.evSub}>
                        {item.locationName ?? ''}{item.cost != null ? ` · ${fmtMoney(item.cost, item.currency)}` : ''}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          );
        })
      )}
      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

// ---------- Multi-day time grid ----------

const GUTTER = 42;
const HEADER_H = 50;
const HOUR_H = 46;
const COL_W = 122;

function MultiDayView({ trip, unit, clock, onEditItem }: { trip: Trip; unit: 'F' | 'C'; clock: ClockPref; onEditItem?: (tripId: string, item: ItineraryItem) => void }) {
  const { startH, endH } = useMemo(() => hourRange(trip.days), [trip.days]);
  const hours: number[] = [];
  for (let h = startH; h <= endH; h++) hours.push(h);
  const gridH = (endH - startH) * HOUR_H;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
      <View style={s.gridWrap}>
        {/* Fixed time gutter (does not scroll horizontally) */}
        <View style={{ width: GUTTER }}>
          <View style={{ height: HEADER_H }} />
          {hours.map((h) => (
            <View key={h} style={{ height: HOUR_H }}>
              <Text style={s.hourLabel}>{labelHour(h, clock)}</Text>
            </View>
          ))}
        </View>

        {/* Horizontally scrollable day columns */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row' }}>
            {trip.days.map((day) => (
              <DayColumn key={day.id} day={day} startH={startH} gridH={gridH} hours={hours} unit={unit} clock={clock} tripId={trip.id} onEditItem={onEditItem} />
            ))}
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  );
}

function DayColumn({ day, startH, gridH, hours, unit, clock, tripId, onEditItem }: { day: Day; startH: number; gridH: number; hours: number[]; unit: 'F' | 'C'; clock: ClockPref; tripId: string; onEditItem?: (tripId: string, item: ItineraryItem) => void }) {
  const conflicts = useMemo(() => detectConflicts(day.items), [day.items]);
  const d = parseDate(day.date);
  return (
    <View style={{ width: COL_W, borderLeftWidth: 1, borderLeftColor: colors.line }}>
      <View style={s.colHeader}>
        <Text style={s.colDow}>{DOW_FULL[d.getDay()]}</Text>
        <Text style={s.colDate}>{d.getDate()}</Text>
        {day.weatherHighC != null ? (
          <Text style={s.colWeather}>{weatherEmoji(day.weatherIcon)} {formatTemp(day.weatherHighC, unit)}</Text>
        ) : null}
      </View>
      <View style={{ height: gridH }}>
        {hours.map((h, i) => (
          <View key={h} style={[s.hourLine, { top: i * HOUR_H }]} />
        ))}
        {day.items.map((item) => {
          const start = timeToMinutes(item.startTime);
          if (start == null) return null;
          const end = timeToMinutes(item.endTime) ?? start + 90;
          const top = ((start - startH * 60) / 60) * HOUR_H;
          const height = Math.max(28, ((end - start) / 60) * HOUR_H - 3);
          const conflict = conflicts.has(item.id);
          const accent = conflict ? colors.danger : (itemAccent[item.type] ?? colors.brand);
          return (
            <Pressable key={item.id} style={[s.event, { top, height, borderLeftColor: accent, backgroundColor: conflict ? '#fff1f2' : '#fff' }]} onPress={() => onEditItem?.(tripId, item)} disabled={!onEditItem} accessibilityLabel={`Edit ${item.title}`}>
              <Text style={s.eventTime}>{formatClock(item.startTime, clock)}</Text>
              <Text style={s.eventTitle} numberOfLines={2}>{item.title}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function hourRange(days: Day[]): { startH: number; endH: number } {
  let min = 24 * 60;
  let max = 0;
  days.forEach((d) =>
    d.items.forEach((it) => {
      const sMin = timeToMinutes(it.startTime);
      if (sMin == null) return;
      const eMin = timeToMinutes(it.endTime) ?? sMin + 90;
      min = Math.min(min, sMin);
      max = Math.max(max, eMin);
    })
  );
  if (min > max) {
    return { startH: 8, endH: 20 };
  }
  return {
    startH: Math.max(0, Math.floor(min / 60) - 1),
    endH: Math.min(24, Math.ceil(max / 60) + 1),
  };
}

function labelHour(h: number, clock: ClockPref): string {
  if (clock === '24h') return `${String(h).padStart(2, '0')}:00`;
  const period = h < 12 ? 'AM' : 'PM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${period}`;
}

// ---------- Day grid (month-ish) ----------

function DayGrid({ trip, selectedDayId, onSelect }: { trip: Trip; selectedDayId?: string; onSelect: (id: string) => void }) {
  const start = parseDate(trip.startDate);
  const end = parseDate(trip.endDate);
  const leadBlanks = (start.getDay() + 6) % 7;
  const cells: ({ dayId?: string; date?: Date; hasItems?: boolean } | null)[] = [];
  for (let i = 0; i < leadBlanks; i++) cells.push(null);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const day = trip.days.find((x) => x.date === iso);
    cells.push({ dayId: day?.id, date: new Date(d), hasItems: (day?.items.length ?? 0) > 0 });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <View style={{ gap: 4 }}>
      {rows.map((row, ri) => (
        <View key={ri} style={s.weekRow}>
          {row.map((c, ci) => {
            if (!c || !c.date) return <View key={ci} style={s.cell} />;
            const on = c.dayId && c.dayId === selectedDayId;
            const planned = c.hasItems;
            return (
              <Pressable key={ci} style={s.cell} onPress={() => c.dayId && onSelect(c.dayId)} disabled={!c.dayId}>
                <View style={[s.cellInner, on && s.cellOn, !on && planned && s.cellHas]}>
                  <Text style={[s.cellText, on && { color: '#fff' }, !on && planned && { color: colors.brand }]}>
                    {c.date.getDate()}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function formatFullDate(iso: string): string {
  const d = parseDate(iso);
  return `${DOW_FULL[d.getDay()]}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  appbar: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10 },
  appbarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  sub: { fontSize: 12, color: colors.ink400, marginTop: 2 },
  modeSeg: { flexDirection: 'row', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, padding: 3, gap: 3 },
  modeOpt: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm - 2 },
  modeOptOn: { backgroundColor: colors.brand },
  modeText: { fontSize: 12, fontWeight: '700', color: colors.ink600 },
  modeTextOn: { color: '#fff' },
  switcher: { flexGrow: 0, marginBottom: 8 },
  tripChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  tripChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tripChipText: { fontSize: 12, fontWeight: '700', color: colors.ink600 },
  body: { paddingHorizontal: 16 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dow: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', color: colors.ink400, marginBottom: 6 },
  cell: { flex: 1, alignItems: 'center' },
  cellInner: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cellOn: { backgroundColor: colors.brand },
  cellHas: { backgroundColor: colors.brand100 },
  cellText: { fontSize: 12, fontWeight: '600', color: colors.ink },
  agendaHead: { fontSize: 13, fontWeight: '800', color: colors.ink, marginBottom: 8, marginLeft: 2 },
  agendaDay: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 12, marginBottom: 8, marginLeft: 2 },
  slot: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  hr: { width: 42, fontSize: 10, color: colors.ink400, paddingTop: 10, fontWeight: '700' },
  ev: { flex: 1, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 3, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8 },
  evConflict: { backgroundColor: '#fff1f2', borderColor: '#fecdd3' },
  evHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  evTitle: { fontSize: 12, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  evSub: { fontSize: 11, color: colors.ink600, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // multi-day
  gridWrap: { flexDirection: 'row', paddingLeft: 12 },
  hourLabel: { fontSize: 9, color: colors.ink400, fontWeight: '700', marginTop: -5, textAlign: 'right', paddingRight: 6 },
  colHeader: { height: HEADER_H, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.line },
  colDow: { fontSize: 10, color: colors.ink400, fontWeight: '700' },
  colDate: { fontSize: 16, color: colors.ink, fontWeight: '800' },
  colWeather: { fontSize: 9, color: colors.ink600, marginTop: 1 },
  hourLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.line },
  event: { position: 'absolute', left: 4, right: 4, borderLeftWidth: 3, borderRadius: 6, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 6, paddingVertical: 3, overflow: 'hidden' },
  eventTime: { fontSize: 9, color: colors.ink400, fontWeight: '700' },
  eventTitle: { fontSize: 10.5, color: colors.ink, fontWeight: '700' },
});
