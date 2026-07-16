import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { Card, Pill } from '../components';
import { colors, radius } from '../theme';
import { Trip, Reaction } from '../types';
import { Recap, RecapScope, RecapTone, recapShareAbsoluteUrl, downloadRecapPdf } from '../api';
import { useAiStatusQuery } from '../queries/ai';
import { useTripReactionsQuery } from '../queries/reactions';
import { ReactionBar } from '../reactions/ReactionBar';
import { PublishRecapSheet } from './PublishRecapSheet';
import {
  useRecapsQuery,
  useGenerateRecapMutation,
  useUpdateRecapMutation,
  useFinalizeRecapMutation,
  useShareRecapMutation,
  useDeleteRecapMutation,
} from '../queries/recaps';

const TONES: { key: RecapTone; label: string }[] = [
  { key: 'Narrative', label: 'Narrative' },
  { key: 'Highlights', label: 'Highlights' },
  { key: 'Bullets', label: 'Bullets' },
];

/**
 * Trip recap workspace (Phase 6): pick a scope + tone, generate a grounded AI draft from the
 * journal, edit it, save (versioned), finalize, then export — PDF download or an unlisted share
 * link. Recaps draw only from the user's notes/transcripts; each section shows how many journal
 * entries informed it.
 */
export function RecapPanel({ trip, selectedDayId }: { trip: Trip; selectedDayId: string }) {
  const statusQuery = useAiStatusQuery();
  const aiEnabled = statusQuery.data?.enabled ?? false;
  const recapsQuery = useRecapsQuery(trip.id);
  const generate = useGenerateRecapMutation(trip.id);
  const { data: reactions = [] } = useTripReactionsQuery(trip.id);

  const [scope, setScope] = useState<RecapScope>('Trip');
  const [tone, setTone] = useState<RecapTone>('Narrative');
  const [openRecapId, setOpenRecapId] = useState<string | null>(null);
  // Day to recap — starts at the planner's selected day but any day is pickable here.
  const [dayId, setDayId] = useState(
    trip.days.some((d) => d.id === selectedDayId) ? selectedDayId : trip.days[0]?.id ?? '',
  );

  const recaps = recapsQuery.data?.data ?? [];

  const runGenerate = () => {
    if (generate.isPending) return;
    const targetId = scope === 'Day' ? dayId || null : null;
    generate.mutate(
      { scope, targetId, tone },
      { onSuccess: (recap) => setOpenRecapId(recap.id) },
    );
  };

  const scopeLabelFor = (recap: Recap): string => {
    if (recap.scope === 'Trip') return 'Whole trip';
    if (recap.scope === 'Day') {
      const day = trip.days.find((d) => d.id === recap.targetId);
      return day ? `Day ${day.dayNumber}` : 'Day';
    }
    for (const d of trip.days) {
      const item = d.items.find((i) => i.id === recap.targetId);
      if (item) return item.title;
    }
    return 'Event';
  };

  return (
    <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>✨ Trip recap</Text>
      <Text style={s.sub}>
        {recaps.length === 0
          ? 'Turn your journal into a story you can edit and share.'
          : `${recaps.length} ${recaps.length === 1 ? 'recap' : 'recaps'} for this trip`}
      </Text>

      {!aiEnabled ? (
        <Card>
          <Text style={s.hint}>
            {statusQuery.isLoading
              ? 'Checking AI…'
              : 'AI is off on this server, so new recaps can’t be generated. Existing recaps below are still yours to edit and export.'}
          </Text>
        </Card>
      ) : (
        <Card>
          <Text style={s.fieldLabel}>Scope</Text>
          <View style={s.segRow}>
            <SegBtn label="Whole trip" on={scope === 'Trip'} onPress={() => setScope('Trip')} />
            {trip.days.length > 0 ? (
              <SegBtn label="Single day" on={scope === 'Day'} onPress={() => setScope('Day')} />
            ) : null}
          </View>
          {scope === 'Day' ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[s.segRow, { marginTop: 8, flexWrap: 'nowrap' }]}
            >
              {trip.days.map((d) => (
                <SegBtn
                  key={d.id}
                  label={`Day ${d.dayNumber}`}
                  on={d.id === dayId}
                  onPress={() => setDayId(d.id)}
                />
              ))}
            </ScrollView>
          ) : null}

          <Text style={s.fieldLabel}>Tone</Text>
          <View style={s.segRow}>
            {TONES.map((t) => (
              <SegBtn key={t.key} label={t.label} on={tone === t.key} onPress={() => setTone(t.key)} />
            ))}
          </View>

          <Pressable
            style={[s.primaryBtn, generate.isPending && s.btnDisabled]}
            onPress={runGenerate}
            disabled={generate.isPending}
            accessibilityLabel="Generate recap"
          >
            {generate.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.primaryBtnText}>Generate draft from journal</Text>
            )}
          </Pressable>
          {generate.error ? <Text style={s.error}>{(generate.error as Error).message}</Text> : null}
          <Text style={s.fineprint}>
            Drafts are written only from your notes and transcripts (plus itinerary facts and the
            real weather on the days you were there).
          </Text>
        </Card>
      )}

      {recaps.map((recap) => (
        <RecapCard
          key={recap.id}
          trip={trip}
          recap={recap}
          scopeLabel={scopeLabelFor(recap)}
          open={openRecapId === recap.id}
          onToggle={() => setOpenRecapId((cur) => (cur === recap.id ? null : recap.id))}
          reactions={reactions}
        />
      ))}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function SegBtn({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[s.segBtn, on && s.segBtnOn]} onPress={onPress} accessibilityLabel={label}>
      <Text style={[s.segText, on && s.segTextOn]}>{label}</Text>
    </Pressable>
  );
}

function RecapCard({
  trip,
  recap,
  scopeLabel,
  open,
  onToggle,
  reactions,
}: {
  trip: Trip;
  recap: Recap;
  scopeLabel: string;
  open: boolean;
  onToggle: () => void;
  reactions: Reaction[];
}) {
  const update = useUpdateRecapMutation(trip.id);
  const finalize = useFinalizeRecapMutation(trip.id);
  const share = useShareRecapMutation(trip.id);
  const remove = useDeleteRecapMutation(trip.id);

  const [title, setTitle] = useState(recap.title);
  const [body, setBody] = useState(recap.body);
  const [includePhotos, setIncludePhotos] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [publishSheetOpen, setPublishSheetOpen] = useState(false);

  const dirty = title !== recap.title || body !== recap.body;
  const isFinal = recap.status === 'Final';

  const save = () => {
    if (!dirty || update.isPending) return;
    update.mutate({ recapId: recap.id, title: title.trim(), body: body.trim() });
  };

  const downloadPdf = async () => {
    setDownloading(true);
    setExportError(null);
    try {
      await downloadRecapPdf(trip.id, recap.id, { includePhotos, fileName: `${trip.title} recap` });
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'PDF export failed.');
    } finally {
      setDownloading(false);
    }
  };

  const shareUrl = recap.shareUrl ? recapShareAbsoluteUrl(recap.shareUrl) : null;

  return (
    <Card style={{ marginTop: 10 }}>
      <Pressable onPress={onToggle} accessibilityLabel={`Open recap ${recap.title}`}>
        <View style={s.cardHead}>
          <Text style={s.cardTitle} numberOfLines={2}>{recap.title}</Text>
          <Pill label={isFinal ? 'Final' : 'Draft'} tone={isFinal ? 'teal' : 'orange'} />
        </View>
        <Text style={s.cardMeta}>
          {scopeLabel} · {recap.tone} · v{recap.version} ·{' '}
          grounded in {recap.generatedFromNoteIds.length}{' '}
          {recap.generatedFromNoteIds.length === 1 ? 'journal entry' : 'journal entries'}
        </Text>
      </Pressable>

      <View style={{ marginTop: 8 }}>
        <ReactionBar tripId={trip.id} targetType="Recap" targetId={recap.id} reactions={reactions} compact />
      </View>

      {open ? (
        <View style={{ marginTop: 10 }}>
          <Text style={s.fieldLabel}>Title</Text>
          <TextInput
            style={s.titleInput}
            value={title}
            onChangeText={setTitle}
            accessibilityLabel="Recap title"
          />

          <Text style={s.fieldLabel}>Story (markdown)</Text>
          <TextInput
            style={s.bodyInput}
            value={body}
            onChangeText={setBody}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Recap body"
          />

          {recap.sections.length > 0 ? (
            <View style={s.citeBlock}>
              {recap.sections.map((section, idx) => (
                <Text key={idx} style={s.citeLine}>
                  • {section.heading || `Section ${idx + 1}`} — from {section.noteIds.length}{' '}
                  {section.noteIds.length === 1 ? 'note' : 'notes'}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={s.actionRow}>
            <Pressable
              style={[s.primaryBtn, { flex: 1 }, (!dirty || update.isPending) && s.btnDisabled]}
              onPress={save}
              disabled={!dirty || update.isPending}
              accessibilityLabel="Save recap edits"
            >
              {update.isPending ? <ActivityIndicator color="#fff" size="small" /> : (
                <Text style={s.primaryBtnText}>{dirty ? 'Save edits' : 'Saved'}</Text>
              )}
            </Pressable>
            {!isFinal ? (
              <Pressable
                style={[s.secondaryBtn, finalize.isPending && s.btnDisabled]}
                onPress={() => finalize.mutate(recap.id)}
                disabled={finalize.isPending}
                accessibilityLabel="Finalize recap"
              >
                <Text style={s.secondaryBtnText}>Finalize</Text>
              </Pressable>
            ) : null}
          </View>
          {update.error ? <Text style={s.error}>{(update.error as Error).message}</Text> : null}

          <Text style={s.fieldLabel}>Export</Text>
          <View style={s.actionRow}>
            <Pressable
              style={[s.secondaryBtn, { flex: 1 }, downloading && s.btnDisabled]}
              onPress={downloadPdf}
              disabled={downloading}
              accessibilityLabel="Download recap PDF"
            >
              {downloading ? <ActivityIndicator color={colors.brand} size="small" /> : (
                <Text style={s.secondaryBtnText}>⬇ PDF</Text>
              )}
            </Pressable>
            <Pressable
              style={[s.secondaryBtn, { flex: 1 }, share.isPending && s.btnDisabled]}
              onPress={() => share.mutate(recap.id)}
              disabled={share.isPending || !!shareUrl}
              accessibilityLabel="Create share link"
            >
              <Text style={s.secondaryBtnText}>{shareUrl ? 'Link ready' : '🔗 Share link'}</Text>
            </Pressable>
            <Pressable
              style={[s.secondaryBtn, { flex: 1 }]}
              onPress={() => setPublishSheetOpen(true)}
              accessibilityLabel="Publish recap publicly"
            >
              <Text style={s.secondaryBtnText}>🌐 Publish</Text>
            </Pressable>
          </View>
          <PublishRecapSheet
            tripId={trip.id}
            tripEndDate={trip.endDate}
            recap={recap}
            visible={publishSheetOpen}
            onClose={() => setPublishSheetOpen(false)}
          />
          <Pressable
            style={s.photoToggle}
            onPress={() => setIncludePhotos((v) => !v)}
            accessibilityLabel="Toggle photos in PDF"
          >
            <Text style={s.photoToggleText}>
              {includePhotos ? '☑' : '☐'} Include journal photos in the PDF
            </Text>
          </Pressable>
          {shareUrl ? (
            <Pressable
              onPress={() => {
                if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
                  navigator.clipboard.writeText(shareUrl).catch(() => Linking.openURL(shareUrl));
                } else {
                  Linking.openURL(shareUrl);
                }
              }}
              accessibilityLabel="Copy or open share link"
            >
              <Text style={s.shareLink} numberOfLines={1}>{shareUrl}</Text>
              <Text style={s.fineprint}>
                Unlisted link — anyone with it can view this recap. Tap to {Platform.OS === 'web' ? 'copy' : 'open'}.
              </Text>
            </Pressable>
          ) : null}
          {exportError ? <Text style={s.error}>{exportError}</Text> : null}
          {share.error ? <Text style={s.error}>{(share.error as Error).message}</Text> : null}

          <Pressable
            style={s.deleteBtn}
            onPress={() => remove.mutate(recap.id)}
            disabled={remove.isPending}
            accessibilityLabel="Delete recap"
          >
            <Text style={s.deleteText}>Delete recap</Text>
          </Pressable>
        </View>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 2 },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 6 },
  sub: { fontSize: 12, color: colors.ink400, marginTop: 2, marginBottom: 12 },
  hint: { fontSize: 13, color: colors.ink600, lineHeight: 19 },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: colors.ink400, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
  segRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  segBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line },
  segBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  segText: { fontSize: 12, fontWeight: '700', color: colors.ink600 },
  segTextOn: { color: '#fff' },
  primaryBtn: { backgroundColor: colors.brand, borderRadius: radius.sm, paddingVertical: 11, alignItems: 'center', marginTop: 14 },
  primaryBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  secondaryBtn: { borderRadius: radius.sm, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, marginTop: 14 },
  secondaryBtnText: { color: colors.ink600, fontSize: 13, fontWeight: '700' },
  btnDisabled: { opacity: 0.55 },
  error: { marginTop: 8, fontSize: 11, color: '#b91c1c' },
  fineprint: { marginTop: 8, fontSize: 11, color: colors.ink400, lineHeight: 16 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.ink, flexShrink: 1 },
  cardMeta: { fontSize: 11, color: colors.ink400, marginTop: 4 },
  titleInput: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '700', color: colors.ink },
  bodyInput: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.ink, minHeight: 180, lineHeight: 19 },
  citeBlock: { marginTop: 10, backgroundColor: colors.brand100, borderRadius: radius.md, padding: 10 },
  citeLine: { fontSize: 11, color: colors.brand, lineHeight: 17, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  photoToggle: { marginTop: 8, alignSelf: 'flex-start' },
  photoToggleText: { fontSize: 12, color: colors.ink600, fontWeight: '600' },
  shareLink: { marginTop: 10, fontSize: 12, color: colors.brand, fontWeight: '700' },
  deleteBtn: { marginTop: 16, alignSelf: 'flex-start' },
  deleteText: { fontSize: 12, color: colors.danger, fontWeight: '700' },
});
