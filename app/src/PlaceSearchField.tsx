import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { PlaceCandidate, searchPlaces, getPlaceDetails } from './api';
import { colors, radius } from './theme';

/** RFC4122-ish session token for Search Box (groups suggest + retrieve into one billed session). */
function newSessionToken(): string {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface SelectedPlace {
  name: string;
  address?: string | null;
  placeId: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface Props {
  value: string;
  onChange: (text: string) => void;
  onSelectPlace: (place: SelectedPlace) => void;
  onClear: () => void;
  placeholder?: string;
  accessibilityLabel?: string;
  /** Bias suggestions toward this point (e.g. the trip area) for better local relevance. */
  proximity?: { lat: number; lng: number } | null;
}

const DEBOUNCE_MS = 300;

export function PlaceSearchField({
  value,
  onChange,
  onSelectPlace,
  onClear,
  placeholder = '📍 Search a place',
  accessibilityLabel = 'Place search',
  proximity = null,
}: Props) {
  const [results, setResults] = useState<PlaceCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQuery = useRef('');
  // One session token spans a series of suggest calls + the retrieve on select; rotate after each pick.
  const sessionRef = useRef<string>(newSessionToken());

  const runSearch = useCallback(async (q: string) => {
    latestQuery.current = q;
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const candidates = await searchPlaces(q, 6, {
        sessionToken: sessionRef.current,
        proximityLat: proximity?.lat ?? null,
        proximityLng: proximity?.lng ?? null,
      });
      if (latestQuery.current !== q) return; // stale result
      setResults(candidates);
      setOpen(true);
    } catch {
      setError('Location search unavailable.');
      setOpen(false);
    } finally {
      if (latestQuery.current === q) setLoading(false);
    }
  }, [proximity?.lat, proximity?.lng]);

  const handleChange = (text: string) => {
    onChange(text);
    if (!text.trim()) {
      onClear();
      setResults([]);
      setOpen(false);
      setError(null);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(text), DEBOUNCE_MS);
  };

  const handleSelect = async (candidate: PlaceCandidate) => {
    onChange(candidate.name);
    // Suggestions carry no coordinates — resolve them via retrieve (same session) before committing.
    let latitude = candidate.latitude ?? null;
    let longitude = candidate.longitude ?? null;
    let address = candidate.address ?? null;
    if (latitude == null || longitude == null) {
      setResolvingId(candidate.placeId);
      try {
        const detail = await getPlaceDetails(candidate.placeId, sessionRef.current);
        if (detail) {
          latitude = detail.latitude;
          longitude = detail.longitude;
          address = address ?? detail.address ?? null;
        }
      } finally {
        setResolvingId(null);
      }
    }
    setOpen(false);
    setResults([]);
    // A pick ends the Search Box session — start a fresh one for the next search.
    sessionRef.current = newSessionToken();
    onSelectPlace({
      name: candidate.name,
      address,
      placeId: candidate.placeId,
      latitude,
      longitude,
    });
  };

  const handleBlur = () => {
    // Brief delay so a tap on a result row registers before the list closes.
    setTimeout(() => setOpen(false), 150);
  };

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  return (
    <View style={open ? s.rootOpen : undefined}>
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          placeholder={placeholder}
          placeholderTextColor={colors.ink400}
          value={value}
          onChangeText={handleChange}
          onBlur={handleBlur}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          autoCapitalize="words"
          returnKeyType="search"
          accessibilityLabel={accessibilityLabel}
        />
        {loading ? (
          <ActivityIndicator size="small" color={colors.brand} style={s.indicator} />
        ) : value.length > 0 ? (
          <Pressable
            onPress={() => { onChange(''); onClear(); setResults([]); setOpen(false); }}
            hitSlop={8}
            style={s.clearBtn}
            accessibilityLabel="Clear place"
          >
            <Text style={s.clearText}>✕</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={s.errorText}>{error}</Text> : null}
      {open && results.length > 0 ? (
        <View style={s.dropdown}>
          {results.map((c) => (
            <Pressable
              key={c.placeId}
              style={s.resultRow}
              onPress={() => handleSelect(c)}
              disabled={resolvingId !== null}
              accessibilityLabel={`Select ${c.name}`}
            >
              <View style={s.resultTextWrap}>
                <Text style={s.resultName} numberOfLines={1}>{c.name}</Text>
                {c.address ? (
                  <Text style={s.resultAddr} numberOfLines={1}>{c.address}</Text>
                ) : null}
              </View>
              {resolvingId === c.placeId ? (
                <ActivityIndicator size="small" color={colors.brand} />
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : open && !loading && value.length >= 2 ? (
        <View style={s.dropdown}>
          <Text style={s.noResults}>No places found. Try a different search.</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  // While the dropdown is open, raise the whole field above following siblings (e.g. the
  // "pin this on the map" hint) so the absolutely-positioned results aren't painted under them.
  rootOpen: { position: 'relative', zIndex: 1000, elevation: 1000 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 13,
    color: colors.ink,
  },
  indicator: { paddingRight: 10 },
  clearBtn: { paddingHorizontal: 10 },
  clearText: { color: colors.ink400, fontSize: 14 },
  errorText: { fontSize: 11, color: colors.ink400, marginTop: 4 },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    marginTop: 2,
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  resultTextWrap: { flex: 1 },
  resultName: { fontSize: 13, fontWeight: '600', color: colors.ink },
  resultAddr: { fontSize: 11, color: colors.ink400, marginTop: 2 },
  noResults: { paddingHorizontal: 12, paddingVertical: 10, fontSize: 12, color: colors.ink400 },
});
