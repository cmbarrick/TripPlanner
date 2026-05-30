import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Linking, TextInput } from 'react-native';
import { Trip, Day, ItineraryItem, PackingItem } from '../types';
import { Card, Pill } from '../components';
import { colors, radius, itemAccent, itemEmoji } from '../theme';
import { dateRange, dayLabel, formatClock, fmtMoney, weatherEmoji, formatTemp } from '../format';
import { ClockPref } from '../store/uiStore';
import { Scope, scopedDays, scopeSummary, conflictIdsForDay, tripPackingItems } from '../scope';
import { sortByTime } from '../itinerary';

type PlannerView = 'list' | 'split' | 'map';

export function TripPlannerScreen({
  trip,
  unit = 'F',
  clock = '12h',
  onBack,
  onEditTrip,
  onDeleteTrip,
  deletingTrip,
  onAddItem,
  onEditItem,
  onReorder,
  onAddPacking,
  onTogglePacking,
  onDeletePacking,
}: {
  trip: Trip;
  unit?: 'F' | 'C';
  clock?: ClockPref;
  onBack: () => void;
  onEditTrip: () => void;
  onDeleteTrip: () => void;
  deletingTrip?: boolean;
  onAddItem: (dayId: string) => void;
  onEditItem: (item: ItineraryItem) => void;
  onReorder: (dayId: string, itemIds: string[]) => void;
  onAddPacking: (name: string) => void;
  onTogglePacking: (id: string, isPacked: boolean) => void;
  onDeletePacking: (id: string) => void;
}) {
  const [scope, setScope] = useState<Scope>('trip');
  const [view, setView] = useState<PlannerView>('list');
  const [selectedDayId, setSelectedDayId] = useState(trip.days[0]?.id ?? '');
  const [showPacking, setShowPacking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const summary = useMemo(() => scopeSummary(trip, scope, selectedDayId), [trip, scope, selectedDayId]);
  const days = scopedDays(trip, scope, selectedDayId);

  const drillIntoDay = (dayId: string) => {
    setSelectedDayId(dayId);
    setScope('day');
  };

  const fabDayId = scope === 'day' ? selectedDayId : trip.days[0]?.id ?? '';
  const packing = tripPackingItems(trip);
  const packedCount = packing.filter((p) => p.isPacked).length;

  return (
    <View style={s.root}>
      <View style={s.appbar}>
        <Pressable style={s.iconBtn} onPress={onBack} accessibilityLabel="Back">
          <Text style={{ fontSize: 20, color: colors.ink600, marginTop: -2 }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={s.title} numberOfLines={1}>{trip.destination.split(',')[0]}</Text>
          <Text style={s.sub}>{dateRange(trip.startDate, trip.endDate)} · {trip.days.length} days · {trip.days.reduce((n, d) => n + d.items.length, 0)} stops</Text>
        </View>
        <Pressable style={s.iconBtn} onPress={onEditTrip} accessibilityLabel="Edit trip">
          <Text style={{ fontSize: 15, color: colors.ink600 }}>✎</Text>
        </Pressable>
        <Pressable style={[s.iconBtn, { marginLeft: 8 }]} onPress={() => setConfirmDelete(true)} accessibilityLabel="Delete trip">
          <Text style={{ fontSize: 15 }}>🗑</Text>
        </Pressable>
      </View>

      {confirmDelete ? (
        <View style={s.confirm}>
          <Text style={s.confirmText}>Delete this trip? This can't be undone.</Text>
          <View style={s.confirmRow}>
            <Pressable style={s.confirmCancel} onPress={() => setConfirmDelete(false)} disabled={deletingTrip}>
              <Text style={s.confirmCancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={s.confirmDelete} onPress={onDeleteTrip} disabled={deletingTrip} accessibilityLabel="Confirm delete trip">
              {deletingTrip ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.confirmDeleteText}>Delete</Text>}
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={s.controls}>
        <View style={s.scopeSeg}>
          {(['day', 'trip'] as Scope[]).map((sc) => {
            const on = sc === scope;
            return (
              <Pressable key={sc} style={[s.segBtn, on && s.segBtnOn]} onPress={() => setScope(sc)} accessibilityLabel={`${sc} scope`}>
                <Text style={[s.segText, on && s.segTextOn]}>{sc === 'day' ? 'Day' : 'Trip'}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={[s.viewSeg, { flex: 1 }]}>
          {(['list', 'split', 'map'] as PlannerView[]).map((v) => {
            const on = v === view;
            return (
              <Pressable key={v} style={[s.segBtn, { flex: 1 }, on && s.segBtnOn]} onPress={() => setView(v)} accessibilityLabel={`${v} view`}>
                <Text style={[s.segText, on && s.segTextOn]}>{v[0].toUpperCase() + v.slice(1)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={s.metaRow}>
        <Pill label={summary.stops === 1 ? '1 stop' : `${summary.stops} stops`} tone="teal" />
        {Object.entries(summary.cost.byCurrency).map(([cur, amt]) => (
          <Pill key={cur} label={fmtMoney(amt, cur)} tone="orange" />
        ))}
        {summary.conflicts > 0 ? <Pill label={`${summary.conflicts} overlap${summary.conflicts > 1 ? 's' : ''}`} tone="danger" /> : null}
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setShowPacking((p) => !p)} style={[s.packToggle, showPacking && s.packToggleOn]} accessibilityLabel="Toggle packing list">
          <Text style={[s.packToggleText, showPacking && { color: '#fff' }]}>🎒 {packedCount}/{packing.length}</Text>
        </Pressable>
      </View>

      {scope === 'day' && trip.days.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dayBar} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {trip.days.map((d) => {
            const on = d.id === selectedDayId;
            const lbl = dayLabel(d.date, d.dayNumber);
            return (
              <Pressable key={d.id} style={[s.dayChip, on && s.dayChipOn]} onPress={() => setSelectedDayId(d.id)}>
                <Text style={[s.dayChipText, on && { color: '#fff' }]}>{lbl.d.replace('· ', '')}</Text>
                <Text style={[s.dayChipSub, on && { color: '#d1fae5' }]}>{lbl.w}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {showPacking ? (
        <PackingPanel
          items={packing}
          onAdd={onAddPacking}
          onToggle={onTogglePacking}
          onDelete={onDeletePacking}
        />
      ) : (
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {view === 'map' ? (
            <MapPlaceholder days={days} large />
          ) : (
            <>
              {view === 'split' ? <MapPlaceholder days={days} /> : null}
              {days.length === 0 ? (
                <Card style={{ marginTop: 12 }}>
                  <Text style={{ color: colors.ink600, fontSize: 13 }}>No days planned yet. Tap + to add your first stop.</Text>
                </Card>
              ) : (
                days.map((day) => (
                  <DayBlock
                    key={day.id}
                    day={day}
                    unit={unit}
                    clock={clock}
                    scope={scope}
                    onHeaderPress={scope === 'trip' ? () => drillIntoDay(day.id) : undefined}
                    onEditItem={onEditItem}
                    onReorder={onReorder}
                  />
                ))
              )}
            </>
          )}
          <AiDock />
          <View style={{ height: 90 }} />
        </ScrollView>
      )}

      {!showPacking && fabDayId ? (
        <Pressable style={s.fab} onPress={() => onAddItem(fabDayId)} accessibilityLabel="Add item">
          <Text style={{ color: '#fff', fontSize: 28, marginTop: -2 }}>+</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function DayBlock({
  day,
  unit,
  clock,
  scope,
  onHeaderPress,
  onEditItem,
  onReorder,
}: {
  day: Day;
  unit: 'F' | 'C';
  clock: ClockPref;
  scope: Scope;
  onHeaderPress?: () => void;
  onEditItem: (item: ItineraryItem) => void;
  onReorder: (dayId: string, itemIds: string[]) => void;
}) {
  const label = dayLabel(day.date, day.dayNumber);
  const conflicts = useMemo(() => conflictIdsForDay(day), [day]);
  const ordered = useMemo(() => [...day.items].sort((a, b) => a.sortOrder - b.sortOrder), [day.items]);

  const move = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= ordered.length) return;
    const ids = ordered.map((i) => i.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    onReorder(day.id, ids);
  };

  return (
    <View style={{ marginBottom: 6 }}>
      <Pressable style={s.dayHead} onPress={onHeaderPress} disabled={!onHeaderPress}>
        <Text style={s.dayD}>{label.d}</Text>
        <Text style={s.dayW}>{label.w}</Text>
        <View style={{ flex: 1 }} />
        {day.weatherHighC != null ? (
          <Text style={s.weather}>{weatherEmoji(day.weatherIcon)} {formatTemp(day.weatherHighC, unit)}</Text>
        ) : null}
        {onHeaderPress ? <Text style={s.drill}>›</Text> : null}
      </Pressable>
      <View style={s.timeline}>
        {ordered.length === 0 ? (
          <Text style={s.emptyDay}>Nothing planned.</Text>
        ) : (
          ordered.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              clock={clock}
              conflict={conflicts.has(item.id)}
              canUp={index > 0}
              canDown={index < ordered.length - 1}
              onEdit={() => onEditItem(item)}
              onUp={() => move(index, -1)}
              onDown={() => move(index, 1)}
            />
          ))
        )}
      </View>
    </View>
  );
}

function ItemRow({
  item,
  clock,
  conflict,
  canUp,
  canDown,
  onEdit,
  onUp,
  onDown,
}: {
  item: ItineraryItem;
  clock: ClockPref;
  conflict: boolean;
  canUp: boolean;
  canDown: boolean;
  onEdit: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <View style={s.itemRow}>
      <View style={s.rail}>
        <Text style={s.time}>{formatClock(item.startTime, clock) || '—'}</Text>
        <View style={[s.dot, { borderColor: conflict ? colors.danger : (itemAccent[item.type] ?? colors.brand) }]} />
      </View>
      <Pressable style={{ flex: 1 }} onPress={onEdit} accessibilityLabel={`Edit ${item.title}`}>
        <Card style={conflict ? s.cardConflict : undefined}>
          <View style={s.itemHeader}>
            <Text style={s.itemName}>{itemEmoji[item.type]} {item.title}</Text>
            {conflict ? <Pill label="Overlap" tone="danger" /> : null}
          </View>
          {item.locationName || item.cost != null || item.confirmationNo ? (
            <Text style={s.itemLoc}>
              {item.locationName ? `📍 ${item.locationName}` : ''}
              {item.cost != null ? `  ·  ${fmtMoney(item.cost, item.currency)}` : ''}
              {item.confirmationNo ? `  ·  #${item.confirmationNo}` : ''}
            </Text>
          ) : null}
          {item.bookingUrl ? (
            <Pressable onPress={() => Linking.openURL(item.bookingUrl!)} hitSlop={6}>
              <Text style={s.itemLink}>🔗 View booking</Text>
            </Pressable>
          ) : null}
        </Card>
      </Pressable>
      <View style={s.orderCol}>
        <Pressable style={[s.orderBtn, !canUp && s.orderBtnOff]} onPress={onUp} disabled={!canUp} accessibilityLabel="Move up">
          <Text style={s.orderText}>↑</Text>
        </Pressable>
        <Pressable style={[s.orderBtn, !canDown && s.orderBtnOff]} onPress={onDown} disabled={!canDown} accessibilityLabel="Move down">
          <Text style={s.orderText}>↓</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MapPlaceholder({ days, large }: { days: Day[]; large?: boolean }) {
  const pins = days.flatMap((d) => d.items).filter((i) => i.latitude != null && i.longitude != null).length;
  return (
    <View style={[s.mapPanel, large && { height: 340 }]}>
      <Text style={s.mapEmoji}>🗺️</Text>
      <Text style={s.mapTitle}>Map view</Text>
      <Text style={s.mapSub}>Coming in Phase 2 · {pins} located stop{pins === 1 ? '' : 's'} ready to pin</Text>
      <View style={s.mapBadge}><Text style={s.mapBadgeText}>Phase 2</Text></View>
    </View>
  );
}

function AiDock() {
  return (
    <View style={s.aiDock}>
      <View style={s.aiSpark}><Text style={{ color: '#fff', fontSize: 13 }}>✨</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={s.aiText}>Ask Wander to plan or tweak this trip…</Text>
      </View>
      <View style={s.aiBadge}><Text style={s.aiBadgeText}>Phase 3</Text></View>
    </View>
  );
}

function PackingPanel({
  items,
  onAdd,
  onToggle,
  onDelete,
}: {
  items: PackingItem[];
  onAdd: (name: string) => void;
  onToggle: (id: string, isPacked: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName('');
  };
  const packed = items.filter((i) => i.isPacked).length;

  return (
    <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={s.packTitle}>Packing & to-dos</Text>
      <Text style={s.packSub}>{packed} of {items.length} packed</Text>

      <View style={s.packAddRow}>
        <TextInput
          style={s.packInput}
          placeholder="Add an item (e.g. Passport)"
          placeholderTextColor={colors.ink400}
          value={name}
          onChangeText={setName}
          onSubmitEditing={add}
          returnKeyType="done"
          accessibilityLabel="New packing item"
        />
        <Pressable style={s.packAddBtn} onPress={add} accessibilityLabel="Add packing item">
          <Text style={s.packAddText}>Add</Text>
        </Pressable>
      </View>

      {items.length === 0 ? (
        <Card style={{ marginTop: 12 }}>
          <Text style={{ color: colors.ink600, fontSize: 13 }}>No packing items yet. Add what you don't want to forget.</Text>
        </Card>
      ) : (
        items.map((item) => (
          <Pressable key={item.id} style={s.packRow} onPress={() => onToggle(item.id, !item.isPacked)} accessibilityLabel={`Toggle ${item.name}`}>
            <View style={[s.checkbox, item.isPacked && s.checkboxOn]}>
              {item.isPacked ? <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text> : null}
            </View>
            <Text style={[s.packName, item.isPacked && s.packNameDone]}>{item.name}</Text>
            <Pressable onPress={() => onDelete(item.id)} hitSlop={8} accessibilityLabel={`Delete ${item.name}`}>
              <Text style={{ color: colors.ink400, fontSize: 16 }}>✕</Text>
            </Pressable>
          </Pressable>
        ))
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  appbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 12, color: colors.ink400, marginTop: 1 },
  iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  confirm: { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, borderRadius: 14, padding: 12 },
  confirmText: { color: '#991b1b', fontSize: 13, fontWeight: '600', marginBottom: 10 },
  confirmRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  confirmCancel: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  confirmCancelText: { color: colors.ink600, fontWeight: '700', fontSize: 13 },
  confirmDelete: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.danger, minWidth: 80, alignItems: 'center' },
  confirmDeleteText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  controls: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  scopeSeg: { flexDirection: 'row', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 3, gap: 3 },
  viewSeg: { flexDirection: 'row', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 3, gap: 3 },
  segBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: colors.brand },
  segText: { fontSize: 12, fontWeight: '700', color: colors.ink600 },
  segTextOn: { color: '#fff' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, marginBottom: 6, flexWrap: 'wrap' },
  packToggle: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  packToggleOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  packToggleText: { fontSize: 11, fontWeight: '800', color: colors.ink600 },
  dayBar: { flexGrow: 0, marginBottom: 6 },
  dayChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  dayChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayChipText: { fontSize: 12, fontWeight: '700', color: colors.ink },
  dayChipSub: { fontSize: 9, color: colors.ink400, marginTop: 1 },
  body: { paddingHorizontal: 16, paddingTop: 2 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 8 },
  dayD: { fontWeight: '800', fontSize: 14, color: colors.ink },
  dayW: { fontSize: 11, color: colors.ink400 },
  weather: { fontSize: 12, color: colors.ink600, fontWeight: '600' },
  drill: { fontSize: 20, color: colors.ink400, marginLeft: 4 },
  timeline: { paddingLeft: 6 },
  emptyDay: { fontSize: 12, color: colors.ink400, paddingVertical: 6 },
  itemRow: { flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'flex-start' },
  rail: { width: 42, alignItems: 'center' },
  time: { fontSize: 11, fontWeight: '700', color: colors.ink400 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff', borderWidth: 3, marginTop: 6 },
  cardConflict: { backgroundColor: '#fff1f2', borderColor: '#fecdd3' },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  itemName: { fontWeight: '700', fontSize: 13, color: colors.ink, flexShrink: 1 },
  itemLoc: { fontSize: 11, color: colors.ink600, marginTop: 4 },
  itemLink: { fontSize: 11, color: colors.brand, fontWeight: '700', marginTop: 6 },
  orderCol: { width: 30, gap: 4 },
  orderBtn: { width: 30, height: 26, borderRadius: 8, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  orderBtnOff: { opacity: 0.35 },
  orderText: { fontSize: 13, fontWeight: '800', color: colors.ink600 },
  mapPanel: { height: 150, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: '#eef2f7', alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 6, overflow: 'hidden' },
  mapEmoji: { fontSize: 30 },
  mapTitle: { fontSize: 14, fontWeight: '800', color: colors.ink600, marginTop: 4 },
  mapSub: { fontSize: 11, color: colors.ink400, marginTop: 2 },
  mapBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: colors.brand100, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  mapBadgeText: { fontSize: 10, fontWeight: '800', color: colors.brand },
  aiDock: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 10, marginTop: 14 },
  aiSpark: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand600 },
  aiText: { fontSize: 12, color: colors.ink400 },
  aiBadge: { backgroundColor: colors.brand100, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  aiBadgeText: { fontSize: 10, fontWeight: '800', color: colors.brand },
  fab: { position: 'absolute', right: 18, bottom: 18, width: 56, height: 56, borderRadius: 18, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: '#0f172a', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  packTitle: { fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 6 },
  packSub: { fontSize: 12, color: colors.ink400, marginTop: 2, marginBottom: 12 },
  packAddRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  packInput: { flex: 1, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 11, fontSize: 13, color: colors.ink },
  packAddBtn: { backgroundColor: colors.brand, paddingHorizontal: 18, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  packAddText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  packRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  packName: { flex: 1, fontSize: 14, color: colors.ink, fontWeight: '600' },
  packNameDone: { color: colors.ink400, textDecorationLine: 'line-through' },
});
