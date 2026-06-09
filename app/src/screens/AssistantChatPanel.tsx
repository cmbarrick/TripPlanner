import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '../components';
import { colors, radius } from '../theme';
import { Trip } from '../types';
import { AiChatHistoryMessage, AiTripChange, streamAiChat, undoAiBatch } from '../api';
import { aiStatusQueryKey } from '../queries/ai';
import { tripsQueryKey } from '../queries/trips';
import { useAiBatchStore } from '../store/aiBatchStore';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export function AssistantChatPanel({
  trips,
  tripId,
  onSelectTrip,
}: {
  trips: Trip[];
  tripId: string | null;
  onSelectTrip: (id: string) => void;
}) {
  const qc = useQueryClient();
  const selectedTrip = useMemo(() => trips.find((t) => t.id === tripId) ?? null, [trips, tripId]);

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activity, setActivity] = useState<AiTripChange[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const batch = useAiBatchStore((s) => (tripId ? s.lastByTrip[tripId] : undefined));
  const markUndone = useAiBatchStore((s) => s.markUndone);
  const setBatch = useAiBatchStore((s) => s.setBatch);

  const send = async () => {
    const text = input.trim();
    if (!text || !tripId || busy) return;

    setError(null);
    setInput('');
    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setBusy(true);

    const history: AiChatHistoryMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let assistantText = '';
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      await streamAiChat(tripId, text, history, (evt) => {
        if (evt.type === 'text_delta' && evt.text) {
          assistantText += evt.text;
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: assistantText };
            return next;
          });
        }
        if (evt.type === 'trip_changed' && evt.changes?.length) {
          setActivity((prev) => [...evt.changes!, ...prev].slice(0, 12));
          qc.invalidateQueries({ queryKey: tripsQueryKey });
        }
        if (evt.type === 'done') {
          qc.invalidateQueries({ queryKey: aiStatusQueryKey });
          if (tripId && evt.batchId && evt.undoSteps?.length) {
            setBatch({
              batchId: evt.batchId,
              tripId,
              changes: evt.changes ?? [],
              undoSteps: evt.undoSteps,
              undone: false,
            });
          }
        }
        if (evt.type === 'error') {
          setError(evt.message ?? 'Chat failed.');
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat failed.');
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setBusy(false);
    }
  };

  const undoLastBatch = async () => {
    if (!tripId || !batch || batch.undone || undoing || busy) return;
    setUndoing(true);
    setError(null);
    try {
      await undoAiBatch(tripId, batch.undoSteps);
      markUndone(tripId);
      qc.invalidateQueries({ queryKey: tripsQueryKey });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Undo failed.');
    } finally {
      setUndoing(false);
    }
  };

  return (
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
                onPress={() => onSelectTrip(trip.id)}
              >
                <Text style={[s.tripChipText, on && s.tripChipTextOn]} numberOfLines={1}>
                  {trip.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Card>

      {activity.length > 0 ? (
        <>
          <Text style={s.section}>Trip changed</Text>
          <Card style={s.activityCard}>
            {activity.slice(0, 6).map((change, idx) => (
              <Text key={`${change.itemId ?? idx}-${change.title}`} style={s.activityLine}>
                {formatChange(change)}
              </Text>
            ))}
            {batch && !batch.undone && batch.undoSteps.length > 0 ? (
              <Pressable
                style={[s.undoBtn, (undoing || busy) && s.btnDisabled]}
                onPress={undoLastBatch}
                disabled={undoing || busy}
              >
                {undoing ? (
                  <ActivityIndicator color={colors.brand} size="small" />
                ) : (
                  <Text style={s.undoBtnText}>Undo last AI batch</Text>
                )}
              </Pressable>
            ) : null}
          </Card>
        </>
      ) : null}

      <Text style={s.section}>Chat</Text>
      <Card style={s.chatCard}>
        <ScrollView style={s.chatScroll} nestedScrollEnabled>
          {messages.length === 0 ? (
            <Text style={s.chatHint}>
              Ask Wander to add stops, check weather, or fill gaps in your schedule. Changes apply to the real trip.
            </Text>
          ) : (
            messages.map((m, idx) => (
              <View
                key={idx}
                style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleAssistant]}
              >
                <Text style={[s.bubbleText, m.role === 'user' && s.bubbleTextUser]}>
                  {m.content || (busy && idx === messages.length - 1 ? '…' : '')}
                </Text>
              </View>
            ))
          )}
        </ScrollView>

        <View style={s.composer}>
          <TextInput
            style={s.composerInput}
            placeholder={selectedTrip ? `Ask about ${selectedTrip.title}…` : 'Select a trip'}
            placeholderTextColor={colors.ink400}
            value={input}
            onChangeText={setInput}
            editable={!busy && !!tripId}
            multiline
            onSubmitEditing={send}
          />
          <Pressable
            style={[s.sendBtn, (!input.trim() || busy || !tripId) && s.btnDisabled]}
            onPress={send}
            disabled={!input.trim() || busy || !tripId}
          >
            {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.sendText}>↑</Text>}
          </Pressable>
        </View>
        {error ? <Text style={s.error}>{error}</Text> : null}
      </Card>
    </>
  );
}

function formatChange(change: AiTripChange): string {
  const prefix =
    change.action === 'added' ? '+' :
    change.action === 'removed' ? '−' :
    change.action === 'moved' ? '↔' : '•';
  const day = change.dayNumber ? ` (day ${change.dayNumber})` : '';
  const detail = change.detail ? ` — ${change.detail}` : '';
  return `${prefix} ${change.title}${day}${detail}`;
}

const s = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '800', color: colors.ink600, marginBottom: 8, marginTop: 16, marginLeft: 2 },
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
  activityCard: { gap: 4 },
  activityLine: { fontSize: 11, color: colors.ink600, lineHeight: 16 },
  undoBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  undoBtnText: { fontSize: 11, fontWeight: '700', color: colors.brand },
  chatCard: { paddingBottom: 10 },
  chatScroll: { maxHeight: 280, marginBottom: 10 },
  chatHint: { fontSize: 12, color: colors.ink400, lineHeight: 18 },
  bubble: {
    maxWidth: '88%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    marginBottom: 8,
  },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: colors.brand },
  bubbleAssistant: { alignSelf: 'flex-start', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line },
  bubbleText: { fontSize: 13, color: colors.ink, lineHeight: 18 },
  bubbleTextUser: { color: '#fff' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.bg,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  btnDisabled: { opacity: 0.5 },
  error: { marginTop: 8, fontSize: 11, color: '#b91c1c' },
});
