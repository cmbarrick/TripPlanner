import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { ItineraryItemType, NoteScope, Trip, ItineraryItem } from '../types';
import { colors, radius } from '../theme';
import { useCreateNoteMutation } from '../queries/notes';
import { usePromptSettings } from './store';
import { parseLocalDateTime } from '../notifications/schedule';

// A guided session steps through at most this many prompts so reflecting stays a quick ritual
// rather than an endless list.
const MAX_STEPS = 6;

/** True once an event's end (or start, or end-of-day) has passed — used to nudge reflection. */
export function isEventPast(trip: Trip, item: ItineraryItem, now: Date = new Date()): boolean {
  const day = trip.days.find((d) => d.id === item.dayId);
  if (!day) return false; // backlog item: no date to compare
  const end = parseLocalDateTime(day.date, item.endTime || item.startTime || '23:59:59');
  return end ? end.getTime() < now.getTime() : false;
}

/**
 * Guided, step-through reflection. One entry point opens a modal that walks the traveler through the
 * applicable prompts one at a time (answer or skip), saving each answer as a `PromptResponse` note —
 * instead of tapping "Reflect" per question. Renders nothing when prompts are off for the trip or no
 * prompt applies. Set `prominent` (e.g. for a past event) to surface a stronger call-to-action.
 */
export function ReflectFlow({
  tripId,
  scope,
  targetId,
  eventType,
  prominent = false,
  ctaLabel,
}: {
  tripId: string;
  scope: NoteScope;
  targetId?: string | null;
  eventType?: ItineraryItemType | null;
  prominent?: boolean;
  ctaLabel?: string;
}) {
  const { provider, enabledForTrip } = usePromptSettings();
  const createNote = useCreateNoteMutation(tripId);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState('');
  const [savedCount, setSavedCount] = useState(0);
  const [done, setDone] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const prompts = useMemo(
    () => provider.forContext({ scope, eventType }).slice(0, MAX_STEPS),
    [provider, scope, eventType],
  );

  useEffect(() => {
    if (!open || done) return;
    // Focusing at mount races the Modal's slide-in animation on iOS -- the keyboard can appear
    // without the TextInput actually becoming first responder. Focus once the modal has finished
    // presenting (onShow) or the step's TextInput has remounted (key={prompt.id}) instead.
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open, done, step]);

  if (!enabledForTrip(tripId) || prompts.length === 0) return null;

  const total = prompts.length;
  const prompt = prompts[Math.min(step, total - 1)];
  const isLast = step >= total - 1;

  const start = () => {
    setStep(0);
    setAnswer('');
    setSavedCount(0);
    setDone(false);
    setOpen(true);
  };

  const advance = () => {
    if (isLast) {
      setDone(true);
    } else {
      setStep((sx) => sx + 1);
      setAnswer('');
    }
  };

  const next = () => {
    const body = answer.trim();
    if (!body) {
      advance(); // empty answer = skip this question
      return;
    }
    if (createNote.isPending) return;
    createNote.mutate(
      {
        scope,
        targetId: targetId ?? null,
        kind: 'PromptResponse',
        bodyText: body,
        promptId: prompt.id,
        promptText: prompt.text,
      },
      {
        onSuccess: () => {
          setSavedCount((c) => c + 1);
          advance();
        },
      },
    );
  };

  return (
    <>
      {prominent ? (
        <Pressable style={s.cta} onPress={start} accessibilityLabel="Reflect on this event">
          <Text style={s.ctaEmoji}>💭</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.ctaTitle}>{ctaLabel ?? 'How did it go?'}</Text>
            <Text style={s.ctaSub}>Step through {total} quick {total === 1 ? 'question' : 'questions'}</Text>
          </View>
          <Text style={s.ctaChevron}>›</Text>
        </Pressable>
      ) : (
        <Pressable style={s.openBtn} onPress={start} accessibilityLabel="Start a guided reflection">
          <Text style={s.openText}>💭 Reflect{total > 1 ? ` · ${total} prompts` : ''}</Text>
        </Pressable>
      )}

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
        onShow={() => inputRef.current?.focus()}
      >
        <View style={s.backdrop}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>{done ? 'Reflection' : `Question ${step + 1} of ${total}`}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityLabel="Close reflection">
                <Text style={s.close}>✕</Text>
              </Pressable>
            </View>

            {!done ? (
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${((step + 1) / total) * 100}%` }]} />
              </View>
            ) : null}

            {done ? (
              <View style={s.doneWrap}>
                <Text style={s.doneEmoji}>{savedCount > 0 ? '✅' : '👋'}</Text>
                <Text style={s.doneTitle}>
                  {savedCount > 0
                    ? `Saved ${savedCount} reflection${savedCount === 1 ? '' : 's'}`
                    : 'Maybe next time'}
                </Text>
                <Text style={s.doneSub}>
                  {savedCount > 0 ? 'They’re in your journal below.' : 'No reflections saved this round.'}
                </Text>
                <Pressable style={s.primaryBtn} onPress={() => setOpen(false)} accessibilityLabel="Finish">
                  <Text style={s.primaryText}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.stepBody}>
                <Text style={s.prompt}>{prompt.text}</Text>
                <TextInput
                  key={prompt.id}
                  ref={inputRef}
                  style={s.input}
                  placeholder="Type your reflection…"
                  placeholderTextColor={colors.ink400}
                  value={answer}
                  onChangeText={setAnswer}
                  multiline
                  accessibilityLabel="Reflection answer"
                />
                {createNote.isError ? <Text style={s.error}>Couldn’t save. Try again.</Text> : null}

                <View style={s.actions}>
                  <Pressable onPress={advance} hitSlop={8} accessibilityLabel="Skip this question">
                    <Text style={s.skip}>{isLast ? 'Finish' : 'Skip'}</Text>
                  </Pressable>
                  <Pressable
                    style={[s.primaryBtn, createNote.isPending && { opacity: 0.6 }]}
                    onPress={next}
                    disabled={createNote.isPending}
                    accessibilityLabel={isLast ? 'Save and finish' : 'Save and continue'}
                  >
                    {createNote.isPending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={s.primaryText}>
                        {answer.trim() ? (isLast ? 'Save & finish' : 'Save & next') : isLast ? 'Finish' : 'Next'}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  openBtn: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  openText: { fontSize: 13, fontWeight: '700', color: colors.brand },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.brand100 },
  ctaEmoji: { fontSize: 22 },
  ctaTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  ctaSub: { fontSize: 11, color: colors.ink600, marginTop: 2 },
  ctaChevron: { fontSize: 24, color: colors.brand, fontWeight: '300' },

  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 24, maxHeight: '88%' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 13, fontWeight: '800', color: colors.ink600, letterSpacing: 0.3 },
  close: { fontSize: 16, fontWeight: '700', color: colors.ink400 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.line, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.brand },

  stepBody: { paddingTop: 18 },
  prompt: { fontSize: 20, fontWeight: '800', color: colors.ink, lineHeight: 27 },
  input: { marginTop: 16, minHeight: 120, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12, color: colors.ink, fontSize: 15, lineHeight: 21, textAlignVertical: 'top', backgroundColor: colors.white },
  error: { color: colors.danger, fontSize: 12, marginTop: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 },
  skip: { fontSize: 14, fontWeight: '700', color: colors.ink400, paddingVertical: 10, paddingHorizontal: 6 },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 12, paddingHorizontal: 22, borderRadius: radius.md, minWidth: 110, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  doneWrap: { alignItems: 'center', paddingVertical: 28 },
  doneEmoji: { fontSize: 40 },
  doneTitle: { fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 12 },
  doneSub: { fontSize: 13, color: colors.ink400, marginTop: 6, textAlign: 'center' },
});
