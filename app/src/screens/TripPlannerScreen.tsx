import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Linking, TextInput, Platform } from 'react-native';
import { WanderMapView } from '../WanderMapView';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { Trip, Day, ItineraryItem, PackingItem } from '../types';
import { Card, Pill } from '../components';
import { colors, radius, itemAccent, itemEmoji } from '../theme';
import { dateRange, dayLabel, formatClock, fmtMoney, wmoEmoji, formatTemp, fmtMinutes } from '../format';
import { useWeatherQuery, ItemWeather, DayWeather } from '../queries/weather';
import { useTravelTimesQuery, TravelSegment } from '../queries/travelTimes';
import { useTripNotesQuery } from '../queries/notes';
import { estimate, buildDirectionsUrl, buildRouteUrl, flightAwareUrl, flightRadar24Url } from '../routing';
import { exportIcs } from '../ics';
import { addTripToCalendar } from '../calendar';
import { ClockPref } from '../store/uiStore';
import {
  Scope,
  scopedDays,
  scopeSummary,
  conflictIdsForDay,
  tripPackingItems,
  daySchedule,
  tripBacklog,
  splitCost,
} from '../scope';

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
  onAddIdea,
  onEditItem,
  onReorder,
  onReorderBacklog,
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
  onAddIdea: (title: string) => void;
  onEditItem: (item: ItineraryItem) => void;
  onReorder: (dayId: string, itemIds: string[]) => void;
  onReorderBacklog: (itemIds: string[]) => void;
  onAddPacking: (name: string) => void;
  onTogglePacking: (id: string, isPacked: boolean) => void;
  onDeletePacking: (id: string) => void;
}) {
  const [scope, setScope] = useState<Scope>('trip');
  const [view, setView] = useState<PlannerView>('list');
  const [selectedDayId, setSelectedDayId] = useState(trip.days[0]?.id ?? '');
  const [panel, setPanel] = useState<'none' | 'packing' | 'ideas' | 'export'>('none');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);

  const summary = useMemo(() => scopeSummary(trip, scope, selectedDayId), [trip, scope, selectedDayId]);
  const days = scopedDays(trip, scope, selectedDayId);
  const cost = useMemo(() => splitCost(days.flatMap((d) => d.items)), [days]);

  const { data: weatherData } = useWeatherQuery(trip.id);
  const { data: travelData }  = useTravelTimesQuery(trip.id);
  const { data: notesData }   = useTripNotesQuery(trip.id);

  // Count of journal notes per itinerary event, so the timeline can flag "has notes".
  const notesByItem = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const note of notesData?.data ?? []) {
      if (note.scope === 'Event' && note.targetId) {
        map[note.targetId] = (map[note.targetId] ?? 0) + 1;
      }
    }
    return map;
  }, [notesData]);
  const itemWeather = useMemo<Record<string, ItemWeather>>(() => {
    const map: Record<string, ItemWeather> = {};
    for (const w of weatherData?.items ?? []) map[w.itemId] = w;
    return map;
  }, [weatherData]);
  const dayWeather = useMemo<Record<string, DayWeather>>(() => {
    const map: Record<string, DayWeather> = {};
    for (const w of weatherData?.days ?? []) map[w.dayId] = w;
    return map;
  }, [weatherData]);

  // Server segments keyed by fromItemId → toItemId for O(1) lookup.
  const travelSegments = useMemo<Record<string, TravelSegment>>(() => {
    const map: Record<string, TravelSegment> = {};
    for (const s of travelData?.segments ?? []) map[s.fromItemId] = s;
    return map;
  }, [travelData]);

  const drillIntoDay = (dayId: string) => {
    setSelectedDayId(dayId);
    setScope('day');
  };

  const showPacking = panel === 'packing';
  const showIdeas   = panel === 'ideas';
  const showExport  = panel === 'export';
  const togglePanel = (which: 'packing' | 'ideas' | 'export') =>
    setPanel((p) => (p === which ? 'none' : which));

  const fabDayId = scope === 'day' ? selectedDayId : trip.days[0]?.id ?? '';
  const packing = tripPackingItems(trip);
  const packedCount = packing.filter((p) => p.isPacked).length;
  const backlog = useMemo(() => tripBacklog(trip), [trip]);

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
        {Object.entries(cost.confirmed.byCurrency).map(([cur, amt]) => (
          <Pill key={cur} label={fmtMoney(amt, cur)} tone="orange" />
        ))}
        {cost.potential.total > 0 ? (
          <Pill
            label={`+${Object.entries(cost.potential.byCurrency).map(([cur, amt]) => fmtMoney(amt, cur)).join(' ')} maybe`}
            tone="neutral"
          />
        ) : null}
        {summary.conflicts > 0 ? <Pill label={`${summary.conflicts} overlap${summary.conflicts > 1 ? 's' : ''}`} tone="danger" /> : null}
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => togglePanel('ideas')} style={[s.packToggle, showIdeas && s.packToggleOn]} accessibilityLabel="Toggle ideas list">
          <Text style={[s.packToggleText, showIdeas && { color: '#fff' }]}>💡 {backlog.length}</Text>
        </Pressable>
        <Pressable onPress={() => togglePanel('packing')} style={[s.packToggle, showPacking && s.packToggleOn]} accessibilityLabel="Toggle packing list">
          <Text style={[s.packToggleText, showPacking && { color: '#fff' }]}>🎒 {packedCount}/{packing.length}</Text>
        </Pressable>
        <Pressable onPress={() => togglePanel('export')} style={[s.packToggle, showExport && s.packToggleOn]} accessibilityLabel="Toggle export panel">
          <Text style={[s.packToggleText, showExport && { color: '#fff' }]}>↑ Export</Text>
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

      {showIdeas ? (
        <IdeasPanel
          items={backlog}
          onAdd={onAddIdea}
          onEdit={onEditItem}
          onReorder={onReorderBacklog}
        />
      ) : showPacking ? (
        <PackingPanel
          items={packing}
          onAdd={onAddPacking}
          onToggle={onTogglePacking}
          onDelete={onDeletePacking}
        />
      ) : showExport ? (
        <ExportPanel
          trip={trip}
          exporting={exporting}
          onExportIcs={async () => {
            setExporting(true);
            try { await exportIcs(trip); } finally { setExporting(false); }
          }}
          onAddToCalendar={async () => {
            setExporting(true);
            try { await addTripToCalendar(trip); } finally { setExporting(false); }
          }}
        />
      ) : (
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {view === 'map' ? (
            <WanderMapView items={days.flatMap((d) => d.items)} onItemPress={onEditItem} large />
          ) : (
            <>
              {view === 'split' ? (
                <WanderMapView items={days.flatMap((d) => d.items)} onItemPress={onEditItem} />
              ) : null}
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
                    dayWeather={dayWeather[day.id]}
                    itemWeather={itemWeather}
                    travelSegments={travelSegments}
                    notesByItem={notesByItem}
                    onHeaderPress={scope === 'trip' ? () => drillIntoDay(day.id) : undefined}
                    onEditItem={onEditItem}
                    onReorder={onReorder}
                  />
                ))
              )}
            </>
          )}
          {view !== 'map' ? <AiDock /> : null}
          <View style={{ height: 90 }} />
        </ScrollView>
      )}

      {panel === 'none' && fabDayId ? (
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
  dayWeather,
  itemWeather,
  travelSegments,
  notesByItem,
  onHeaderPress,
  onEditItem,
  onReorder,
}: {
  day: Day;
  unit: 'F' | 'C';
  clock: ClockPref;
  scope: Scope;
  dayWeather?: DayWeather;
  itemWeather: Record<string, ItemWeather>;
  travelSegments: Record<string, TravelSegment>;
  notesByItem: Record<string, number>;
  onHeaderPress?: () => void;
  onEditItem: (item: ItineraryItem) => void;
  onReorder: (dayId: string, itemIds: string[]) => void;
}) {
  const label = dayLabel(day.date, day.dayNumber);
  const conflicts = useMemo(() => conflictIdsForDay(day), [day]);
  const { timed, anytime } = useMemo(() => daySchedule(day), [day]);

  const moveAnytime = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= anytime.length) return;
    const ids = anytime.map((i) => i.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    onReorder(day.id, ids);
  };

  const empty = timed.length === 0 && anytime.length === 0;

  // Live weather from the API takes precedence over seeded/static day weather fields.
  const liveHigh = dayWeather?.highC ?? day.weatherHighC;
  const liveCode = dayWeather?.weatherCode;

  return (
    <View style={{ marginBottom: 6 }}>
      <Pressable style={s.dayHead} onPress={onHeaderPress} disabled={!onHeaderPress}>
        <Text style={s.dayD}>{label.d}</Text>
        <Text style={s.dayW}>{label.w}</Text>
        <View style={{ flex: 1 }} />
        {liveHigh != null ? (
          <View style={s.weatherBadge}>
            <Text style={s.weather}>
              {liveCode != null ? wmoEmoji(liveCode) : '🌡️'} {formatTemp(liveHigh, unit)}
            </Text>
            {dayWeather?.isClimateSummary ? (
              <Text style={s.climatePill}>typical</Text>
            ) : null}
          </View>
        ) : null}
        {onHeaderPress ? <Text style={s.drill}>›</Text> : null}
      </Pressable>
      <View style={s.timeline}>
        {empty ? <Text style={s.emptyDay}>Nothing planned.</Text> : null}
        {timed.map((item, idx) => (
          <React.Fragment key={item.id}>
            <ItemRow
              item={item}
              clock={clock}
              conflict={conflicts.has(item.id)}
              weather={itemWeather[item.id]}
              noteCount={notesByItem[item.id] ?? 0}
              unit={unit}
              showOrder={false}
              onEdit={() => onEditItem(item)}
            />
            {idx < timed.length - 1 ? (
              <TravelRow
                fromItem={item}
                toItem={timed[idx + 1]!}
                segment={travelSegments[item.id]}
              />
            ) : null}
          </React.Fragment>
        ))}
        {anytime.length > 0 ? (
          <View style={s.anytimeHead}>
            <Text style={s.anytimeLabel}>◦ Anytime</Text>
          </View>
        ) : null}
        {anytime.map((item, index) => (
          <ItemRow
            key={item.id}
            item={item}
            clock={clock}
            conflict={conflicts.has(item.id)}
            weather={itemWeather[item.id]}
            noteCount={notesByItem[item.id] ?? 0}
            unit={unit}
            showOrder
            canUp={index > 0}
            canDown={index < anytime.length - 1}
            onEdit={() => onEditItem(item)}
            onUp={() => moveAnytime(index, -1)}
            onDown={() => moveAnytime(index, 1)}
          />
        ))}
      </View>
    </View>
  );
}

function ItemRow({
  item,
  clock,
  conflict,
  weather,
  noteCount = 0,
  unit = 'F',
  showOrder,
  canUp = false,
  canDown = false,
  onEdit,
  onUp,
  onDown,
}: {
  item: ItineraryItem;
  clock: ClockPref;
  conflict: boolean;
  weather?: ItemWeather;
  noteCount?: number;
  unit?: 'F' | 'C';
  showOrder: boolean;
  canUp?: boolean;
  canDown?: boolean;
  onEdit: () => void;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const tentative = item.status === 'Tentative';
  return (
    <View style={s.itemRow}>
      <View style={s.rail}>
        <Text style={s.time}>{formatClock(item.startTime, clock) || '◦'}</Text>
        <View style={[s.dot, tentative && s.dotTentative, { borderColor: conflict ? colors.danger : (itemAccent[item.type] ?? colors.brand) }]} />
      </View>
      <Pressable style={{ flex: 1 }} onPress={onEdit} accessibilityLabel={`Edit ${item.title}`}>
        <Card style={[conflict ? s.cardConflict : null, tentative ? s.cardTentative : null] as any}>
          <View style={s.itemHeader}>
            <Text style={[s.itemName, tentative && s.itemNameMuted]} numberOfLines={2}>{itemEmoji[item.type]} {item.title}</Text>
            <View style={s.itemBadges}>
              {noteCount > 0 ? (
                <Text style={s.noteBadge} accessibilityLabel={`${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`}>
                  📝 {noteCount}
                </Text>
              ) : null}
              {weather ? (
                <Text style={s.itemWeather}>
                  {wmoEmoji(weather.weatherCode)} {formatTemp(weather.highC, unit)}
                  {weather.isClimateSummary ? ' ~' : ''}
                </Text>
              ) : null}
              {conflict ? <Pill label="Overlap" tone="danger" /> : tentative ? <Pill label="Tentative" tone="orange" /> : null}
            </View>
          </View>
          {item.locationName || item.cost != null || item.confirmationNo ? (
            <Text style={s.itemLoc}>
              {item.locationName ? `📍 ${item.locationName}` : ''}
              {item.cost != null ? `  ·  ${fmtMoney(item.cost, item.currency)}` : ''}
              {item.confirmationNo ? `  ·  #${item.confirmationNo}` : ''}
            </Text>
          ) : null}
          {item.type === 'Flight' && item.flightNumber ? (
            <View style={s.flightLinks}>
              <Pressable onPress={() => Linking.openURL(flightAwareUrl(item.flightNumber!))} hitSlop={6} accessibilityLabel="Track on FlightAware">
                <Text style={s.itemLink}>✈ FlightAware</Text>
              </Pressable>
              <Text style={s.flightLinkSep}>·</Text>
              <Pressable onPress={() => Linking.openURL(flightRadar24Url(item.flightNumber!))} hitSlop={6} accessibilityLabel="Track on FlightRadar24">
                <Text style={s.itemLink}>📡 FR24</Text>
              </Pressable>
            </View>
          ) : item.bookingUrl ? (
            <Pressable onPress={() => Linking.openURL(item.bookingUrl!)} hitSlop={6}>
              <Text style={s.itemLink}>🔗 View booking</Text>
            </Pressable>
          ) : null}
        </Card>
      </Pressable>
      {showOrder ? (
        <View style={s.orderCol}>
          <Pressable style={[s.orderBtn, !canUp && s.orderBtnOff]} onPress={onUp} disabled={!canUp} accessibilityLabel="Move up">
            <Text style={s.orderText}>↑</Text>
          </Pressable>
          <Pressable style={[s.orderBtn, !canDown && s.orderBtnOff]} onPress={onDown} disabled={!canDown} accessibilityLabel="Move down">
            <Text style={s.orderText}>↓</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}


function TravelRow({
  fromItem,
  toItem,
  segment,
}: {
  fromItem: ItineraryItem;
  toItem: ItineraryItem;
  segment?: TravelSegment;
}) {
  // If the departing item is a flight, show tracking links instead of walk/drive.
  if (fromItem.type === 'Flight') {
    if (!fromItem.flightNumber) return null;
    return (
      <View style={s.travelRow}>
        <View style={s.travelLine} />
        <Text style={s.travelText}>✈ {fromItem.flightNumber}</Text>
        <Pressable
          onPress={() => Linking.openURL(flightAwareUrl(fromItem.flightNumber!))}
          style={s.dirBtn}
          accessibilityLabel="Track on FlightAware"
        >
          <Text style={s.dirBtnText}>Track ›</Text>
        </Pressable>
      </View>
    );
  }

  // Normal ground leg — need coords on both sides.
  const hasCoords =
    fromItem.latitude != null && fromItem.longitude != null &&
    toItem.latitude   != null && toItem.longitude   != null;
  if (!hasCoords) return null;

  const est = segment ?? estimate(
    fromItem.latitude!, fromItem.longitude!,
    toItem.latitude!,   toItem.longitude!,
  );

  const openDirections = () => Linking.openURL(
    buildDirectionsUrl(
      { lat: fromItem.latitude!, lng: fromItem.longitude! },
      { lat: toItem.latitude!,   lng: toItem.longitude! },
    ),
  );

  return (
    <View style={s.travelRow}>
      <View style={s.travelLine} />
      <Text style={s.travelText}>
        🚶 {fmtMinutes(est.walkingMinutes)}  ·  🚗 {fmtMinutes(est.drivingMinutes)}
        {'  '}
        <Text style={s.travelDist}>({est.distanceKm} km)</Text>
      </Text>
      <Pressable onPress={openDirections} style={s.dirBtn} accessibilityLabel="Get directions">
        <Text style={s.dirBtnText}>Directions ›</Text>
      </Pressable>
    </View>
  );
}

function ExportPanel({
  trip,
  exporting,
  onExportIcs,
  onAddToCalendar,
}: {
  trip: Trip;
  exporting: boolean;
  onExportIcs: () => Promise<void>;
  onAddToCalendar: () => Promise<void>;
}) {
  const itemCount = trip.days.reduce((n, d) => n + d.items.length, 0);
  return (
    <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <Text style={s.packTitle}>↑ Export & Sync</Text>
      <Text style={s.packSub}>{itemCount} itinerary items across {trip.days.length} days</Text>

      <Pressable
        style={[s.exportBtn, exporting && { opacity: 0.6 }]}
        onPress={onExportIcs}
        disabled={exporting}
        accessibilityLabel="Export .ics calendar file"
      >
        {exporting
          ? <ActivityIndicator size="small" color={colors.brand} />
          : <Text style={s.exportBtnText}>📅  Export .ics</Text>}
        <Text style={s.exportBtnSub}>
          Download a calendar file — import into any calendar app
        </Text>
      </Pressable>

      {Platform.OS !== 'web' ? (
        <Pressable
          style={[s.exportBtn, exporting && { opacity: 0.6 }]}
          onPress={onAddToCalendar}
          disabled={exporting}
          accessibilityLabel="Add to device calendar"
        >
          {exporting
            ? <ActivityIndicator size="small" color={colors.brand} />
            : <Text style={s.exportBtnText}>
                {Platform.OS === 'ios' ? '🍎  Add to Apple Calendar' : '📱  Add to Google Calendar'}
              </Text>}
          <Text style={s.exportBtnSub}>
            Writes events directly to your device calendar
          </Text>
        </Pressable>
      ) : null}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function AiDock() {
  return (
    <View style={s.aiDock}>
      <View style={s.aiSpark}><Text style={{ color: '#fff', fontSize: 13 }}>✨</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={s.aiText}>Ask Wander to plan or tweak this trip…</Text>
      </View>
      <View style={s.aiBadge}><Text style={s.aiBadgeText}>Phase 5</Text></View>
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

function IdeasPanel({
  items,
  onAdd,
  onEdit,
  onReorder,
}: {
  items: ItineraryItem[];
  onAdd: (title: string) => void;
  onEdit: (item: ItineraryItem) => void;
  onReorder: (itemIds: string[]) => void;
}) {
  const [title, setTitle] = useState('');
  const add = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setTitle('');
  };

  // Gesture-based drag is unreliable on react-native-web, so we expose tap
  // up/down controls there and keep drag-and-drop on native.
  const useArrows = Platform.OS === 'web';
  const moveBy = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= items.length) return;
    const ids = items.map((i) => i.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    onReorder(ids);
  };

  const Header = (
    <View>
      <Text style={s.packTitle}>💡 Ideas</Text>
      <Text style={s.packSub}>
        {useArrows
          ? 'Unscheduled wishes. Reorder with the arrows, tap to give one a date or confirm it.'
          : 'Unscheduled wishes. Drag to reorder, tap to give one a date or confirm it.'}
      </Text>
      <View style={s.packAddRow}>
        <TextInput
          style={s.packInput}
          placeholder="Add an idea (e.g. Valley of the Temples)"
          placeholderTextColor={colors.ink400}
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={add}
          returnKeyType="done"
          accessibilityLabel="New idea"
        />
        <Pressable style={s.packAddBtn} onPress={add} accessibilityLabel="Add idea">
          <Text style={s.packAddText}>Add</Text>
        </Pressable>
      </View>
      {items.length === 0 ? (
        <Card style={{ marginTop: 12 }}>
          <Text style={{ color: colors.ink600, fontSize: 13 }}>No ideas yet. Jot down places you might want to fit in.</Text>
        </Card>
      ) : null}
    </View>
  );

  const renderItem = ({ item, drag, isActive, getIndex }: RenderItemParams<ItineraryItem>) => {
    const tentative = item.status === 'Tentative';
    const index = getIndex() ?? 0;
    return (
      <ScaleDecorator>
        <View style={[s.ideaRow, isActive && s.ideaRowActive]}>
          {useArrows ? (
            <View style={s.dragHandle}>
              <Pressable
                onPress={() => moveBy(index, -1)}
                disabled={index === 0}
                hitSlop={6}
                accessibilityLabel={`Move ${item.title} up`}
              >
                <Text style={[s.reorderArrow, index === 0 && s.reorderArrowDisabled]}>▲</Text>
              </Pressable>
              <Pressable
                onPress={() => moveBy(index, 1)}
                disabled={index === items.length - 1}
                hitSlop={6}
                accessibilityLabel={`Move ${item.title} down`}
              >
                <Text style={[s.reorderArrow, index === items.length - 1 && s.reorderArrowDisabled]}>▼</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPressIn={drag}
              hitSlop={8}
              style={s.dragHandle}
              accessibilityLabel={`Drag ${item.title}`}
            >
              <Text style={s.dragGrip}>⠿</Text>
            </Pressable>
          )}
          <Pressable style={{ flex: 1 }} onPress={() => onEdit(item)} onLongPress={drag} accessibilityLabel={`Edit ${item.title}`}>
            <Card style={tentative ? s.cardTentative : undefined}>
              <View style={s.itemHeader}>
                <Text style={[s.itemName, tentative && s.itemNameMuted]} numberOfLines={2}>{itemEmoji[item.type]} {item.title}</Text>
                <Pill label={tentative ? 'Tentative' : 'Wishlist'} tone={tentative ? 'orange' : 'neutral'} />
              </View>
              {item.locationName || item.cost != null ? (
                <Text style={s.itemLoc}>
                  {item.locationName ? `📍 ${item.locationName}` : ''}
                  {item.cost != null ? `  ·  ${fmtMoney(item.cost, item.currency)}` : ''}
                </Text>
              ) : null}
              <Text style={s.ideaHint}>Tap to schedule →</Text>
            </Card>
          </Pressable>
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <DraggableFlatList
      data={items}
      keyExtractor={(i) => i.id}
      onDragEnd={({ data }) => onReorder(data.map((i) => i.id))}
      renderItem={renderItem}
      ListHeaderComponent={Header}
      ListFooterComponent={<View style={{ height: 40 }} />}
      contentContainerStyle={s.body}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    />
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
  weatherBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  weather: { fontSize: 12, color: colors.ink600, fontWeight: '600' },
  climatePill: { fontSize: 9, color: colors.ink400, fontWeight: '700', backgroundColor: colors.brand100, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 999 },
  itemBadges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemWeather: { fontSize: 11, color: colors.ink400, fontWeight: '600' },
  noteBadge: { fontSize: 11, color: colors.brand, fontWeight: '800' },
  flightLinks: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  flightLinkSep: { fontSize: 11, color: colors.ink400 },
  travelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 50, paddingRight: 4, marginBottom: 8, marginTop: -4 },
  travelLine: { position: 'absolute', left: 57, top: 0, bottom: 0, width: 1, backgroundColor: colors.line },
  travelText: { fontSize: 11, color: colors.ink400, flex: 1 },
  travelDist: { color: colors.ink400, opacity: 0.7 },
  dirBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.brand100 },
  dirBtnText: { fontSize: 11, color: colors.brand, fontWeight: '700' },
  exportBtn: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  exportBtnText: { fontSize: 14, fontWeight: '800', color: colors.ink, marginBottom: 4 },
  exportBtnSub: { fontSize: 12, color: colors.ink400 },
  drill: { fontSize: 20, color: colors.ink400, marginLeft: 4 },
  timeline: { paddingLeft: 6 },
  emptyDay: { fontSize: 12, color: colors.ink400, paddingVertical: 6 },
  itemRow: { flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'flex-start' },
  rail: { width: 42, alignItems: 'center' },
  time: { fontSize: 11, fontWeight: '700', color: colors.ink400 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff', borderWidth: 3, marginTop: 6 },
  cardConflict: { backgroundColor: '#fff1f2', borderColor: '#fecdd3' },
  cardTentative: { borderStyle: 'dashed', borderColor: '#fcd34d', backgroundColor: '#fffbeb' },
  dotTentative: { backgroundColor: '#fffbeb' },
  itemNameMuted: { color: colors.ink600 },
  anytimeHead: { marginTop: 2, marginBottom: 6, paddingLeft: 50 },
  anytimeLabel: { fontSize: 11, fontWeight: '800', color: colors.ink400, textTransform: 'uppercase', letterSpacing: 0.5 },
  ideaRow: { flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'center' },
  ideaRowActive: { opacity: 0.9 },
  ideaHint: { fontSize: 10, color: colors.brand, fontWeight: '700', marginTop: 6 },
  dragHandle: { width: 26, height: 40, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dragGrip: { fontSize: 18, color: colors.ink400, fontWeight: '800' },
  reorderArrow: { fontSize: 12, color: colors.ink600, fontWeight: '800', lineHeight: 14 },
  reorderArrowDisabled: { color: colors.line },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  itemName: { fontWeight: '700', fontSize: 13, color: colors.ink, flexShrink: 1 },
  itemLoc: { fontSize: 11, color: colors.ink600, marginTop: 4 },
  itemLink: { fontSize: 11, color: colors.brand, fontWeight: '700', marginTop: 6 },
  orderCol: { width: 30, gap: 4 },
  orderBtn: { width: 30, height: 26, borderRadius: 8, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  orderBtnOff: { opacity: 0.35 },
  orderText: { fontSize: 13, fontWeight: '800', color: colors.ink600 },
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
