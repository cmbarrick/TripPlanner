import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Note, MediaAsset } from '../types';
import { colors, radius } from '../theme';
import { VoicePlayer } from '../voice/VoicePlayer';
import { PhotoView } from '../media/PhotoView';
import { usePromptSettings } from '../prompts/store';

/** A single journal entry: voice player, body text, photos, transcript, timestamp, and delete. */
export function NoteCard({
  note,
  tripId,
  onDelete,
  anchorLabel,
}: {
  note: Note;
  tripId: string;
  onDelete: () => void;
  anchorLabel?: string;
}) {
  const media = note.mediaAssets ?? [];
  const audio = media.find((m) => m.kind === 'Audio');
  const photos = media.filter((m) => m.kind === 'Photo');
  const { provider } = usePromptSettings();
  const promptText =
    note.kind === 'PromptResponse' && note.promptId ? provider.byId(note.promptId)?.text : undefined;
  return (
    <View style={st.row}>
      <View style={{ flex: 1 }}>
        {anchorLabel ? <Text style={st.anchor}>{anchorLabel}</Text> : null}
        {promptText ? <Text style={st.prompt}>💭 {promptText}</Text> : null}
        {audio ? <VoicePlayer tripId={tripId} media={audio} /> : null}
        {note.bodyText ? <Text style={st.body}>{note.bodyText}</Text> : null}
        {photos.map((p) => (
          <View key={p.id} style={st.photo}>
            <PhotoView tripId={tripId} media={p} />
          </View>
        ))}
        {audio ? <Transcript media={audio} /> : null}
        <Text style={st.meta}>{formatNoteTime(note.createdAt)}</Text>
      </View>
      <Pressable onPress={onDelete} hitSlop={8} accessibilityLabel="Delete journal entry">
        <Text style={st.delete}>✕</Text>
      </Pressable>
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
  delete: { color: colors.ink400, fontSize: 14, fontWeight: '700', marginTop: 2 },
  transcript: { fontSize: 13, color: colors.ink600, fontStyle: 'italic', marginTop: 6, lineHeight: 18 },
  transcriptMuted: { fontSize: 11, color: colors.ink400, marginTop: 6 },
});
