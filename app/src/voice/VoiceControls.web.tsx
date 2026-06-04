import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';
import { audioRecordingSupported, createRecorder, formatDuration, Recorder } from '../audioRecording';
import { useCreateVoiceNoteMutation } from '../queries/notes';
import { VoiceControlsProps } from './types';

/** Web voice capture using the browser MediaRecorder API: tap to record, tap to stop & upload. */
export function VoiceControls({ tripId, scope, targetId }: VoiceControlsProps) {
  const createVoice = useCreateVoiceNoteMutation(tripId);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<Recorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.cancel();
  }, []);

  if (!audioRecordingSupported) {
    return <Text style={st.hint}>🎤 Voice notes can be recorded from the web app for now.</Text>;
  }

  const start = async () => {
    try {
      const rec = createRecorder();
      await rec.start();
      recorderRef.current = rec;
      setElapsed(0);
      setRecording(true);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch {
      setRecording(false);
    }
  };

  const stop = async () => {
    const rec = recorderRef.current;
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    recorderRef.current = null;
    if (!rec) return;
    try {
      const result = await rec.stop();
      createVoice.mutate({
        fields: { scope, targetId, durationSeconds: result.durationSeconds, locale: 'en-US' },
        audio: result.blob,
        fileName: result.fileName,
      });
    } catch {
      // recording failed — nothing persisted
    }
  };

  if (createVoice.isPending) {
    return (
      <View style={st.row}>
        <ActivityIndicator size="small" color={colors.brand} />
        <Text style={st.recText}>Uploading voice note…</Text>
      </View>
    );
  }

  return (
    <View>
      <Pressable
        style={[st.btn, recording && st.btnRec]}
        onPress={recording ? stop : start}
        accessibilityLabel={recording ? 'Stop recording' : 'Record a voice note'}
      >
        <Text style={[st.btnText, recording && { color: '#fff' }]}>
          {recording ? `■ Stop · ${formatDuration(elapsed)}` : '🎤 Record voice note'}
        </Text>
      </Pressable>
      {createVoice.isError ? <Text style={st.error}>Couldn't upload the recording. Try again.</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  btn: { marginTop: 10, alignItems: 'center', paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.brand100 },
  btnRec: { backgroundColor: colors.danger, borderColor: colors.danger },
  btnText: { fontSize: 13, fontWeight: '800', color: colors.brand },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  recText: { fontSize: 12, color: colors.ink600, fontWeight: '600' },
  hint: { fontSize: 12, color: colors.ink400, marginTop: 10 },
  error: { color: colors.danger, fontSize: 12, fontWeight: '600', marginTop: 4 },
});
