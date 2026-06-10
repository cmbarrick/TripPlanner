import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Pressable,
} from 'react-native';
import { Card } from '../components';
import { colors, radius, itemEmoji } from '../theme';
import { Trip } from '../types';
import { useAiStatusQuery, useGenerateItineraryMutation } from '../queries/ai';
import { draftItemToInput, GenerateItineraryResponse } from '../api';
import { useCreateItemMutation } from '../queries/itinerary';
import { dayLabel } from '../format';
import { AssistantChatPanel } from './AssistantChatPanel';

type AssistantMode = 'generate' | 'chat';

type PinnedDraft = {
  tripId: string;
  response: GenerateItineraryResponse;
};

export function AssistantScreen({
  trips,
  initialTripId,
}: {
  trips: Trip[];
  initialTripId: string | null;
}) {
  const statusQuery = useAiStatusQuery();
  const status = statusQuery.data;
  const generate = useGenerateItineraryMutation();
  const createItem = useCreateItemMutation();

  const defaultTripId = initialTripId ?? trips[0]?.id ?? null;
  const [tripId, setTripId] = useState<string | null>(defaultTripId);
  const [mode, setMode] = useState<AssistantMode>('chat');
  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState<PinnedDraft | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (initialTripId) setTripId(initialTripId);
  }, [initialTripId]);

  useEffect(() => {
    if (tripId && !trips.some((t) => t.id === tripId)) {
      setTripId(trips[0]?.id ?? null);
      setDraft(null);
    }
  }, [tripId, trips]);

  const selectedTrip = useMemo(
    () => trips.find((t) => t.id === tripId) ?? null,
    [tripId, trips],
  );

  const draftTrip = useMemo(
    () => (draft ? trips.find((t) => t.id === draft.tripId) ?? null : null),
    [draft, trips],
  );

  const groupedDraft = useMemo(() => {
    if (!draft || !draftTrip) return [];
    const byDay = new Map<number, typeof draft.response.items>();
    for (const item of draft.response.items) {
      const list = byDay.get(item.dayNumber) ?? [];
      list.push(item);
      byDay.set(item.dayNumber, list);
    }
    return draftTrip.days
      .filter((d) => byDay.has(d.dayNumber))
      .map((day) => ({ day, items: byDay.get(day.dayNumber)! }));
  }, [draft, draftTrip]);

  const runGenerate = () => {
    if (!tripId || !prompt.trim()) return;
    setApplyError(null);
    const targetTripId = tripId;
    generate.mutate(
      { tripId: targetTripId, prompt: prompt.trim() },
      {
        onSuccess: (result) => setDraft({ tripId: targetTripId, response: result }),
        onError: () => setDraft(null),
      },
    );
  };

  const discardDraft = () => {
    setDraft(null);
    setApplyError(null);
  };

  const applyDraft = async () => {
    if (!draft || !draftTrip) {
      setApplyError('That trip is no longer available. Regenerate the draft.');
      return;
    }
    setApplying(true);
    setApplyError(null);
    try {
      for (const item of draft.response.items) {
        const day = draftTrip.days.find((d) => d.dayNumber === item.dayNumber);
        if (!day) continue;
        await createItem.mutateAsync({
          tripId: draft.tripId,
          dayId: day.id,
          input: draftItemToInput(item, draftTrip.currency),
        });
      }
      setDraft(null);
      setPrompt('');
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : 'Could not apply draft.');
    } finally {
      setApplying(false);
    }
  };

  if (statusQuery.isLoading) {
    return (
      <View style={[s.root, s.center]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!status?.enabled) {
    return (
      <View style={s.root}>
        <View style={s.appbar}>
          <Text style={s.title}>Assistant</Text>
          <Text style={s.sub}>Manual planning always works</Text>
        </View>
        <View style={s.center}>
          <Text style={s.emoji}>✨</Text>
          <Text style={s.phase}>AI not configured</Text>
          <Text style={s.blurb}>
            This server has no Azure OpenAI key yet. Wander is fully usable without AI — add activities, maps, and
            notes as usual.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <View style={s.appbar}>
        <Text style={s.title}>Assistant</Text>
        <Text style={s.sub}>
          {mode === 'chat' ? 'Chat edits your trip' : 'Generate a draft itinerary'} ·{' '}
          {status.tokensRemainingToday.toLocaleString()} tokens left today
        </Text>
        {trips.length > 0 ? (
          <View style={s.modeSeg}>
            {(['chat', 'generate'] as AssistantMode[]).map((m) => {
              const on = mode === m;
              return (
                <Pressable key={m} style={[s.modeOpt, on && s.modeOptOn]} onPress={() => setMode(m)}>
                  <Text style={[s.modeOptText, on && s.modeOptTextOn]}>
                    {m === 'chat' ? 'Chat' : 'Generate'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {trips.length === 0 ? (
          <Card>
            <Text style={s.hint}>Create a trip on the Trips tab first, then come back to generate a draft.</Text>
          </Card>
        ) : mode === 'chat' ? (
          <AssistantChatPanel trips={trips} tripId={tripId} onSelectTrip={setTripId} />
        ) : (
          <>
            <Text style={s.section}>Trip</Text>
            <Card>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tripRow}>
                {trips.map((trip) => {
                  const on = trip.id === tripId;
                  return (
                    <Pressable
                      key={trip.id}
                      style={[s.tripChip, on && s.tripChipOn]}
                      onPress={() => {
                        setTripId(trip.id);
                        setDraft(null);
                      }}
                    >
                      <Text style={[s.tripChipText, on && s.tripChipTextOn]} numberOfLines={1}>
                        {trip.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Card>

            <Text style={s.section}>Prompt</Text>
            <Card>
              <TextInput
                style={s.promptInput}
                placeholder="e.g. Plan 3 relaxed days focused on food markets and viewpoints"
                placeholderTextColor={colors.ink400}
                value={prompt}
                onChangeText={setPrompt}
                multiline
                editable={!generate.isPending && !applying}
              />
              <Pressable
                style={[s.primaryBtn, (!prompt.trim() || generate.isPending || !tripId) && s.btnDisabled]}
                onPress={runGenerate}
                disabled={!prompt.trim() || generate.isPending || !tripId}
              >
                {generate.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.primaryBtnText}>Generate draft</Text>
                )}
              </Pressable>
              {generate.error ? (
                <Text style={s.error}>{(generate.error as Error).message}</Text>
              ) : null}
            </Card>

            {draft && draftTrip ? (
              <>
                <Text style={s.section}>Draft preview</Text>
                <Card style={s.draftCard}>
                  <Text style={s.draftTarget}>Applying to: {draftTrip.title}</Text>
                  <Text style={s.draftSummary}>{draft.response.summary}</Text>
                  <Text style={s.draftMeta}>
                    {draft.response.items.length} stops · {draft.response.tokensUsed.toLocaleString()} tokens
                  </Text>

                  {groupedDraft.map(({ day, items }) => {
                    const label = dayLabel(day.date, day.dayNumber);
                    return (
                    <View key={day.id} style={s.dayBlock}>
                      <Text style={s.dayHead}>{label.d} · {label.w}</Text>
                      {items.map((item, idx) => (
                        <View key={`${day.id}-${idx}`} style={s.draftItem}>
                          <Text style={s.draftEmoji}>{itemEmoji[item.type] ?? '📍'}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={s.draftTitle}>{item.title}</Text>
                            <Text style={s.draftDetail}>
                              {[item.startTime?.slice(0, 5), item.locationName].filter(Boolean).join(' · ') ||
                                'Flexible timing'}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                    );
                  })}

                  <View style={s.actionRow}>
                    <Pressable
                      style={[s.primaryBtn, s.applyBtn, (applying || createItem.isPending) && s.btnDisabled]}
                      onPress={applyDraft}
                      disabled={applying || createItem.isPending}
                    >
                      <Text style={s.primaryBtnText}>{applying ? 'Applying…' : 'Apply to trip'}</Text>
                    </Pressable>
                    <Pressable style={s.secondaryBtn} onPress={discardDraft} disabled={applying}>
                      <Text style={s.secondaryBtnText}>Discard</Text>
                    </Pressable>
                  </View>
                  {applyError ? <Text style={s.error}>{applyError}</Text> : null}
                  <Text style={s.draftNote}>
                    Items are added as Tentative — review and confirm them on the trip planner.
                  </Text>
                </Card>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  appbar: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  sub: { fontSize: 13, color: colors.ink600, marginTop: 2 },
  modeSeg: {
    flexDirection: 'row',
    marginTop: 10,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    padding: 3,
    gap: 3,
    alignSelf: 'flex-start',
  },
  modeOpt: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.sm - 2 },
  modeOptOn: { backgroundColor: colors.brand },
  modeOptText: { fontSize: 12, fontWeight: '800', color: colors.ink600 },
  modeOptTextOn: { color: '#fff' },
  body: { paddingHorizontal: 16, paddingBottom: 24, gap: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8 },
  emoji: { fontSize: 52 },
  phase: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: '800',
    color: colors.brand,
    backgroundColor: colors.brand100,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  blurb: { textAlign: 'center', color: colors.ink600, fontSize: 13, lineHeight: 19, marginTop: 6 },
  section: { fontSize: 13, fontWeight: '800', color: colors.ink600, marginBottom: 8, marginTop: 16, marginLeft: 2 },
  hint: { fontSize: 13, color: colors.ink600, lineHeight: 19 },
  tripRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  tripChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    maxWidth: 160,
  },
  tripChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tripChipText: { fontSize: 12, fontWeight: '700', color: colors.ink600 },
  tripChipTextOn: { color: '#fff' },
  promptInput: {
    minHeight: 88,
    fontSize: 14,
    color: colors.ink,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.sm,
    paddingVertical: 11,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  btnDisabled: { opacity: 0.55 },
  secondaryBtn: {
    borderRadius: radius.sm,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  secondaryBtnText: { color: colors.ink600, fontSize: 13, fontWeight: '700' },
  error: { marginTop: 10, fontSize: 11, color: '#b91c1c' },
  draftCard: { gap: 8 },
  draftTarget: { fontSize: 12, fontWeight: '800', color: colors.brand, marginBottom: 4 },
  draftSummary: { fontSize: 15, fontWeight: '800', color: colors.ink },
  draftMeta: { fontSize: 11, color: colors.ink400, marginBottom: 4 },
  dayBlock: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
  dayHead: { fontSize: 12, fontWeight: '800', color: colors.ink600, marginBottom: 8 },
  draftItem: { flexDirection: 'row', gap: 10, marginBottom: 8, alignItems: 'flex-start' },
  draftEmoji: { fontSize: 16, marginTop: 1 },
  draftTitle: { fontSize: 13, fontWeight: '700', color: colors.ink },
  draftDetail: { fontSize: 11, color: colors.ink400, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14, alignItems: 'center' },
  applyBtn: { flex: 1 },
  draftNote: { fontSize: 11, color: colors.ink400, lineHeight: 16, marginTop: 8 },
});
