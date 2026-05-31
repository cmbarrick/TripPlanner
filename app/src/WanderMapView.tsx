/**
 * WanderMapView — Phase 2 schematic map.
 *
 * Plots itinerary stops as numbered pins on a bounding-box-normalised grid.
 * Same-location items are merged into a single cluster pin; nearby pins are
 * given a small spiral offset so they don't perfectly overlap.
 * No external map tiles or API keys required.
 * Future slice: replace this canvas with react-native-maps / Mapbox tiles.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ItineraryItem } from './types';
import { colors, radius, itemAccent, itemEmoji } from './theme';

interface Props {
  items: ItineraryItem[];
  onItemPress: (item: ItineraryItem) => void;
  large?: boolean;
}

interface Cluster {
  items: ItineraryItem[];
  lat: number;
  lng: number;
  x: number; // 0..1 normalised, after jitter
  y: number; // 0..1 normalised, top = 0, after jitter
}

// Two coords within SNAP_DEG degrees (~100 m) count as the same location.
const SNAP_DEG = 0.001;

export function WanderMapView({ items, onItemPress, large }: Props) {
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const panelH = large ? 300 : 180;

  const located = useMemo(
    () => items.filter((i) => i.latitude != null && i.longitude != null),
    [items],
  );

  const clusters = useMemo<Cluster[]>(() => {
    if (located.length === 0) return [];

    // Group items that share a location within SNAP_DEG tolerance.
    const groups: { items: ItineraryItem[]; lat: number; lng: number }[] = [];
    for (const item of located) {
      const lat = item.latitude!;
      const lng = item.longitude!;
      const existing = groups.find(
        (g) => Math.abs(g.lat - lat) < SNAP_DEG && Math.abs(g.lng - lng) < SNAP_DEG,
      );
      if (existing) {
        existing.items.push(item);
      } else {
        groups.push({ items: [item], lat, lng });
      }
    }

    const lats = groups.map((g) => g.lat);
    const lngs = groups.map((g) => g.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latSpan = maxLat - minLat || 0.01;
    const lngSpan = maxLng - minLng || 0.01;

    // Build cluster list incrementally so each entry can check already-placed pins.
    const placed: Cluster[] = [];
    const SPREAD = 0.06;
    const MIN_SEP = 0.05;

    for (const g of groups) {
      const baseX = (g.lng - minLng) / lngSpan;
      const baseY = 1 - (g.lat - minLat) / latSpan; // flip: higher lat = higher on screen

      // Spiral-offset this cluster until it doesn't overlap any already-placed pin.
      let x = baseX;
      let y = baseY;
      for (let attempt = 0; attempt < 30; attempt++) {
        const angle = (attempt * 2.4) % (2 * Math.PI); // golden-angle spiral
        const r = attempt === 0 ? 0 : SPREAD * Math.sqrt(attempt);
        x = baseX + r * Math.cos(angle);
        y = baseY + r * Math.sin(angle);
        const tooClose = placed.some(
          (p) => Math.abs(p.x - x) < MIN_SEP && Math.abs(p.y - y) < MIN_SEP,
        );
        if (!tooClose) break;
      }

      placed.push({
        items: g.items,
        lat: g.lat,
        lng: g.lng,
        x: Math.max(0.05, Math.min(0.95, x)),
        y: Math.max(0.05, Math.min(0.95, y)),
      });
    }
    return placed;
  }, [located]);

  const unlocated = items.filter((i) => i.latitude == null || i.longitude == null);
  const hasLocated = clusters.length > 0;
  const selItems = selectedCluster != null ? clusters[selectedCluster]?.items ?? [] : [];

  return (
    <View>
      {/* ── Map canvas ─────────────────────────────────────────────────────── */}
      <View style={[s.canvas, { height: panelH }]}>
        {[0.25, 0.5, 0.75].map((t) => (
          <View key={`h${t}`} style={[s.gridH, { top: `${t * 100}%` as any }]} />
        ))}
        {[0.25, 0.5, 0.75].map((t) => (
          <View key={`v${t}`} style={[s.gridV, { left: `${t * 100}%` as any }]} />
        ))}

        {!hasLocated ? (
          <View style={s.emptyOverlay}>
            <Text style={s.emptyIcon}>📍</Text>
            <Text style={s.emptyText}>No located stops yet.</Text>
            <Text style={s.emptySub}>
              Search a place in the add/edit screen to pin stops here.
            </Text>
          </View>
        ) : null}

        {clusters.map((cluster, idx) => {
          const isSel = selectedCluster === idx;
          const accent = itemAccent[cluster.items[0].type] ?? colors.brand;
          const count = cluster.items.length;
          return (
            <Pressable
              key={idx}
              style={[
                s.pin,
                count > 1 && s.pinCluster,
                {
                  left: `${cluster.x * 100}%` as any,
                  top: `${cluster.y * 100}%` as any,
                  backgroundColor: isSel ? accent : colors.white,
                  borderColor: accent,
                  transform: [{ scale: isSel ? 1.25 : 1 }],
                  zIndex: isSel ? 10 : 1,
                },
              ]}
              onPress={() => {
                if (isSel) {
                  setSelectedCluster(null);
                } else {
                  setSelectedCluster(idx);
                  if (count === 1) onItemPress(cluster.items[0]);
                }
              }}
              accessibilityLabel={
                count === 1
                  ? `Pin for ${cluster.items[0].title}`
                  : `${count} stops here`
              }
            >
              <Text style={[s.pinLabel, { color: isSel ? '#fff' : accent }]}>
                {count > 1 ? `${count}` : itemEmoji[cluster.items[0].type]}
              </Text>
            </Pressable>
          );
        })}

        {/* Callout for selected cluster */}
        {selItems.length > 0 && selectedCluster != null ? (
          <View style={s.callout} pointerEvents="none">
            {selItems.slice(0, 4).map((item) => (
              <Text key={item.id} style={s.calloutLine} numberOfLines={1}>
                {itemEmoji[item.type]} {item.title}
              </Text>
            ))}
            {selItems.length > 4 ? (
              <Text style={s.calloutMore}>+{selItems.length - 4} more — tap a legend row</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* ── Legend (large view only) ────────────────────────────────────────── */}
      {large && items.length > 0 ? (
        <ScrollView style={s.legend} showsVerticalScrollIndicator={false}>
          {clusters.map((cluster, idx) => {
            const accent = itemAccent[cluster.items[0].type] ?? colors.brand;
            const isSel = selectedCluster === idx;
            return (
              <View key={idx}>
                {cluster.items.map((item, itemIdx) => (
                  <Pressable
                    key={item.id}
                    style={[s.legendRow, isSel && { backgroundColor: colors.brand100 }]}
                    onPress={() => {
                      setSelectedCluster(isSel ? null : idx);
                      onItemPress(item);
                    }}
                    accessibilityLabel={`Open ${item.title}`}
                  >
                    {itemIdx === 0 ? (
                      <View style={[s.legendBadge, { backgroundColor: accent }]}>
                        <Text style={s.legendNum}>{cluster.items.length > 1 ? cluster.items.length : itemEmoji[item.type]}</Text>
                      </View>
                    ) : (
                      <View style={[s.legendBadge, { backgroundColor: 'transparent', borderWidth: 1, borderColor: accent }]}>
                        <Text style={[s.legendNum, { color: accent }]}>↳</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={s.legendName} numberOfLines={1}>
                        {itemEmoji[item.type]} {item.title}
                      </Text>
                      {item.locationName ? (
                        <Text style={s.legendSub} numberOfLines={1}>{item.locationName}</Text>
                      ) : null}
                    </View>
                    <Text style={s.legendArrow}>›</Text>
                  </Pressable>
                ))}
              </View>
            );
          })}
          {unlocated.length > 0 ? (
            <Text style={s.unlocatedNote}>
              +{unlocated.length} stop{unlocated.length > 1 ? 's' : ''} without coordinates — search
              a place to pin them.
            </Text>
          ) : null}
          <View style={{ height: 16 }} />
        </ScrollView>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  canvas: {
    position: 'relative',
    backgroundColor: '#ddeedd',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 4,
  },
  gridH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  gridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  emptyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  emptyIcon: { fontSize: 28, marginBottom: 6 },
  emptyText: { fontSize: 13, fontWeight: '700', color: colors.ink600 },
  emptySub: { fontSize: 11, color: colors.ink400, textAlign: 'center', marginTop: 4 },
  pin: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -14,
    marginTop: -14,
    shadowColor: '#0f172a',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  pinCluster: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginLeft: -17,
    marginTop: -17,
  },
  pinLabel: { fontSize: 12, fontWeight: '800' },
  callout: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: radius.md,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  calloutLine: { fontSize: 12, fontWeight: '600', color: colors.ink, marginBottom: 2 },
  calloutMore: { fontSize: 10, color: colors.brand, fontWeight: '700', marginTop: 2 },
  legend: { maxHeight: 220 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    borderRadius: radius.sm,
  },
  legendBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendNum: { fontSize: 11, fontWeight: '800', color: '#fff' },
  legendName: { fontSize: 12, fontWeight: '600', color: colors.ink },
  legendSub: { fontSize: 10, color: colors.ink400, marginTop: 1 },
  legendArrow: { fontSize: 16, color: colors.ink400 },
  unlocatedNote: {
    fontSize: 10,
    color: colors.ink400,
    fontStyle: 'italic',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
});
