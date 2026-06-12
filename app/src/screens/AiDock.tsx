import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { colors, radius } from '../theme';
import { useAiStatusQuery } from '../queries/ai';
import { useAiBatchStore } from '../store/aiBatchStore';
import { useUiStore } from '../store/uiStore';
import { undoAiBatch } from '../api';
import { tripsQueryKey } from '../queries/trips';

/**
 * In-trip AI composer (Phase 6 Slice 0). Typing here hands the prompt to the Assistant
 * tab's chat (trip stays pinned via uiStore.openTripId) where it is auto-sent; tapping
 * the sparkle with no text just opens the chat. Degrades to a passive notice when the
 * server has no AI configured. "Undo AI" appears while a chat batch from this session
 * is still reversible.
 */
export function AiDock({ tripId }: { tripId: string }) {
  const qc = useQueryClient();
  const statusQuery = useAiStatusQuery();
  const openAssistant = useUiStore((s) => s.openAssistant);
  const batch = useAiBatchStore((s) => s.lastByTrip[tripId]);
  const markUndone = useAiBatchStore((s) => s.markUndone);
  const [draft, setDraft] = useState('');
  const [undoing, setUndoing] = useState(false);

  const aiEnabled = statusQuery.data?.enabled ?? false;

  const undoLastBatch = async () => {
    if (!batch || batch.undone || undoing) return;
    setUndoing(true);
    try {
      await undoAiBatch(tripId, batch.undoSteps);
      markUndone(tripId);
      qc.invalidateQueries({ queryKey: tripsQueryKey });
    } finally {
      setUndoing(false);
    }
  };

  const send = () => {
    if (!aiEnabled) return;
    openAssistant(draft);
    setDraft('');
  };

  const undoButton =
    batch && !batch.undone && batch.undoSteps.length > 0 ? (
      <Pressable
        style={[s.aiUndoBtn, undoing && { opacity: 0.5 }]}
        onPress={undoLastBatch}
        disabled={undoing}
        accessibilityLabel="Undo last AI change"
      >
        {undoing ? (
          <ActivityIndicator color={colors.brand} size="small" />
        ) : (
          <Text style={s.aiUndoText}>Undo AI</Text>
        )}
      </Pressable>
    ) : null;

  if (!aiEnabled) {
    // AI not configured (or status still loading) — passive dock; manual planning always works.
    return (
      <View style={s.aiDock}>
        <View style={[s.aiSpark, s.aiSparkOff]}><Text style={{ fontSize: 13 }}>✨</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.aiText}>
            {statusQuery.isLoading ? 'Checking AI…' : 'AI is off on this server — manual planning always works.'}
          </Text>
        </View>
        {undoButton}
      </View>
    );
  }

  return (
    <View style={s.aiDock}>
      <Pressable
        style={s.aiSpark}
        onPress={send}
        accessibilityLabel="Open Wander assistant for this trip"
      >
        <Text style={{ color: '#fff', fontSize: 13 }}>✨</Text>
      </Pressable>
      <TextInput
        style={s.aiInput}
        placeholder="Ask Wander to plan or tweak this trip…"
        placeholderTextColor={colors.ink400}
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={send}
        returnKeyType="send"
        accessibilityLabel="Ask Wander about this trip"
      />
      {undoButton}
      <Pressable
        style={s.aiSendBtn}
        onPress={send}
        accessibilityLabel="Send to Wander assistant"
      >
        <Text style={s.aiSendText}>↑</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  aiDock: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 10, marginTop: 14 },
  aiSpark: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand600 },
  aiSparkOff: { backgroundColor: colors.line },
  aiText: { fontSize: 12, color: colors.ink400 },
  aiInput: { flex: 1, fontSize: 12, color: colors.ink, paddingVertical: 4, paddingHorizontal: 0 },
  aiSendBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  aiSendText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  aiUndoBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bg,
  },
  aiUndoText: { fontSize: 11, fontWeight: '700', color: colors.brand },
});
