import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { Note, MediaAsset } from '../types';
import { colors, radius } from '../theme';
import { VoicePlayer } from '../voice/VoicePlayer';
import { PhotoView } from '../media/PhotoView';
import { usePromptSettings } from '../prompts/store';

/** A single journal entry: voice player, body text, photos, transcript, timestamp, edit + delete. */
export function NoteCard({
  note,
  tripId,
  onDelete,
  onEdit,
  savingEdit,
  anchorLabel,
}: {
  note: Note;
  tripId: string;
  onDelete: () => void;
  onEdit?: (bodyText: string) => void;
  savingEdit?: boolean;
  anchorLabel?: string;
}) {
  const media = note.mediaAssets ?? [];
  const audio = media.find((m) => m.kind === 'Audio');
  const photos = media.filter((m) => m.kind === 'Photo');
  const { provider } = usePromptSettings();
  // Prefer the question text persisted on the note; fall back to resolving a (preset) prompt id for
  // older notes saved before promptText existed.
  const promptText =
    note.kind === 'PromptResponse'
      ? note.promptText ?? (note.promptId ? provider.byId(note.promptId)?.text : undefined)
      : undefined;

  // Only the typed body text is editable (Text + PromptResponse notes). Voice/photo notes carry
  // their content in media, so they're delete-only.
  const editable = onEdit != null && (note.kind === 'Text' || note.kind === 'PromptResponse');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.bodyText ?? '');

  const startEdit = () => {
    setDraft(note.bodyText ?? '');
    setEditing(true);
  };
  const saveEdit = () => {
    const next = draft.trim();
    if (!next || next === (note.bodyText ?? '')) {
      setEditing(false);
      return;
    }
    onEdit?.(next);
    setEditing(false);
  };

  return (
    <View style={st.row}>
      <View style={{ flex: 1 }}>
        {anchorLabel ? <Text style={st.anchor}>{anchorLabel}</Text> : null}
        {promptText ? <Text style={st.prompt}>💭 {promptText}</Text> : null}
        {audio ? <VoicePlayer tripId={tripId} media={audio} /> : null}
        {editing ? (
          <View>
            <TextInput
              style={st.editInput}
              value={draft}
              onChangeText={setDraft}
              multiline
              autoFocus
              accessibilityLabel="Edit journal entry"
            />
            <View style={st.editActions}>
              <Pressable onPress={() => setEditing(false)} hitSlop={6} accessibilityLabel="Cancel edit">
                <Text style={st.editCancel}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveEdit} disabled={savingEdit} hitSlop={6} accessibilityLabel="Save edit">
                {savingEdit ? <ActivityIndicator size="small" color={colors.brand} /> : <Text style={st.editSave}>Save</Text>}
              </Pressable>
            </View>
          </View>
        ) : note.bodyText ? (
          <Text style={st.body}>{note.bodyText}</Text>
        ) : null}
        {photos.map((p) => (
          <View key={p.id} style={st.photo}>
            <PhotoView tripId={tripId} media={p} />
          </View>
        ))}
        {audio ? <Transcript media={audio} /> : null}
        <Text style={st.meta}>
          {formatNoteTime(note.createdAt)}
          {note.pendingSync ? '  ·  ⏳ Saved offline — will sync' : ''}
        </Text>
      </View>
      {editing ? null : (
        <View style={st.actions}>
          {editable ? (
            <Pressable onPress={startEdit} hitSlop={8} accessibilityLabel="Edit journal entry">
              <Text style={st.edit}>✎</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onDelete} hitSlop={8} accessibilityLabel="Delete journal entry">
            <Text style={st.delete}>✕</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function Transcript({ media }: { media: MediaAsset }) {
  if (media.transcript) return <Text style={st.transcript}>“{media.transcript}”</Text>;
  if (media.transcriptionStatus === 'Pending') return <Text style={st.transcriptMuted}>⏳ Transcribing…</Text>;
  if (media.transcriptionStatus === 'Failed') return <Text style={st.transcriptMuted}>Transcript unavailable.</Text>;
  return null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Platform-safe short timestamp (avoids Intl/toLocaleString gaps on Hermes). */
export function formatNoteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${MONTHS[d.getMonth()]} ${d.getDate()} · ${h}:${min} ${ampm}`;
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10 },
  anchor: { fontSize: 10, fontWeight: '800', color: colors.brand, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  prompt: { fontSize: 12, fontWeight: '700', color: colors.ink600, marginBottom: 4, lineHeight: 17 },
  body: { fontSize: 13, color: colors.ink, lineHeight: 18 },
  photo: { marginTop: 8 },
  meta: { fontSize: 10, color: colors.ink400, fontWeight: '700', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  edit: { color: colors.ink400, fontSize: 14, fontWeight: '700', marginTop: 2 },
  delete: { color: colors.ink400, fontSize: 14, fontWeight: '700', marginTop: 2 },
  editInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.ink,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 6 },
  editCancel: { fontSize: 12, fontWeight: '700', color: colors.ink400 },
  editSave: { fontSize: 12, fontWeight: '800', color: colors.brand },
  transcript: { fontSize: 13, color: colors.ink600, fontStyle: 'italic', marginTop: 6, lineHeight: 18 },
  transcriptMuted: { fontSize: 11, color: colors.ink400, marginTop: 6 },
});
