import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { PlaceCandidate, searchPlaces } from './api';
import { colors, radius } from './theme';

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
}

const DEBOUNCE_MS = 300;

export function PlaceSearchField({
  value,
  onChange,
  onSelectPlace,
  onClear,
  placeholder = '📍 Search a place',
  accessibilityLabel = 'Place search',
}: Props) {
  const [results, setResults] = useState<PlaceCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQuery = useRef('');

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
      const candidates = await searchPlaces(q);
      if (latestQuery.current !== q) return; // stale result
      setResults(candidates);
      setOpen(true);
    } catch {
      setError('Location search unavailable.');
      setOpen(false);
    } finally {
      if (latestQuery.current === q) setLoading(false);
    }
  }, []);

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

  const handleSelect = (candidate: PlaceCandidate) => {
    onChange(candidate.name);
    setOpen(false);
    setResults([]);
    onSelectPlace({
      name: candidate.name,
      address: candidate.address,
      placeId: candidate.placeId,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
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
    <View>
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
              accessibilityLabel={`Select ${c.name}`}
            >
              <Text style={s.resultName} numberOfLines={1}>{c.name}</Text>
              {c.address ? (
                <Text style={s.resultAddr} numberOfLines={1}>{c.address}</Text>
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  resultName: { fontSize: 13, fontWeight: '600', color: colors.ink },
  resultAddr: { fontSize: 11, color: colors.ink400, marginTop: 2 },
  noResults: { paddingHorizontal: 12, paddingVertical: 10, fontSize: 12, color: colors.ink400 },
});
