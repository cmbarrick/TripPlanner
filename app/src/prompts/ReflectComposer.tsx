import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { ItineraryItemType, NoteScope } from '../types';
import { colors, radius } from '../theme';
import { useCreateNoteMutation } from '../queries/notes';
import { usePromptSettings } from './store';

/**
 * Surfaces a reflection prompt and saves the answer as a `PromptResponse` note. Used in the event
 * journal (scope `Event`) and the trip/day journal (scope `Day`/`Trip`). Renders nothing when
 * prompts are turned off for the trip or no prompt applies to the context.
 */
export function ReflectComposer({
  tripId,
  scope,
  targetId,
  eventType,
}: {
  tripId: string;
  scope: NoteScope;
  targetId?: string | null;
  eventType?: ItineraryItemType | null;
}) {
  const { provider, enabledForTrip } = usePromptSettings();
  const createNote = useCreateNoteMutation(tripId);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');

  const prompts = useMemo(
    () => provider.forContext({ scope, eventType }),
    [provider, scope, eventType],
  );

  if (!enabledForTrip(tripId) || prompts.length === 0) return null;

  const prompt = prompts[index % prompts.length];

  const shuffle = () => {
    setIndex((i) => (prompts.length <= 1 ? i : (i + 1) % prompts.length));
    setAnswer('');
  };

  const save = () => {
    const body = answer.trim();
    if (!body || createNote.isPending) return;
    createNote.mutate(
      { scope, targetId: targetId ?? null, kind: 'PromptResponse', bodyText: body, promptId: prompt.id },
      {
        onSuccess: () => {
          setAnswer('');
          setOpen(false);
          setIndex((i) => (prompts.length <= 1 ? i : (i + 1) % prompts.length));
        },
      },
    );
  };

  if (!open) {
    return (
      <Pressable style={s.openBtn} onPress={() => setOpen(true)} accessibilityLabel="Answer a reflection prompt">
        <Text style={s.openText}>💭 Reflect</Text>
      </Pressable>
    );
  }

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.prompt}>{prompt.text}</Text>
        <Pressable onPress={shuffle} hitSlop={8} accessibilityLabel="Show another prompt">
          <Text style={s.shuffle}>↻</Text>
        </Pressable>
      </View>
      <TextInput
        style={s.input}
        placeholder="Your reflection…"
        placeholderTextColor={colors.ink400}
        value={answer}
        onChangeText={setAnswer}
        multiline
        accessibilityLabel="Reflection answer"
      />
      {createNote.isError ? <Text style={s.error}>Couldn't save. Try again.</Text> : null}
      <View style={s.actions}>
        <Pressable onPress={() => { setOpen(false); setAnswer(''); }} accessibilityLabel="Cancel reflection">
          <Text style={s.cancel}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[s.saveBtn, (!answer.trim() || createNote.isPending) && { opacity: 0.5 }]}
          onPress={save}
          disabled={!answer.trim() || createNote.isPending}
          accessibilityLabel="Save reflection"
        >
          {createNote.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.saveText}>Save</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  openBtn: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  openText: { fontSize: 13, fontWeight: '700', color: colors.brand },
  card: { marginTop: 10, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.white },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  prompt: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.ink, lineHeight: 19 },
  shuffle: { fontSize: 16, color: colors.brand, fontWeight: '800', marginTop: 1 },
  input: { marginTop: 10, minHeight: 64, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, color: colors.ink, fontSize: 13, textAlignVertical: 'top' },
  error: { color: colors.danger, fontSize: 12, marginTop: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16, marginTop: 10 },
  cancel: { fontSize: 13, fontWeight: '700', color: colors.ink400 },
  saveBtn: { backgroundColor: colors.brand, paddingVertical: 8, paddingHorizontal: 18, borderRadius: radius.md, minWidth: 64, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
