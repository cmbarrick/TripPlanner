import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { colors, radius } from '../theme';
import { formatDuration } from '../audioRecording';
import { useCreateVoiceNoteMutation } from '../queries/notes';
import { VoiceControlsProps } from './types';

/** Native voice capture using expo-audio: tap to record, tap to stop & upload. */
export function VoiceControls({ tripId, scope, targetId }: VoiceControlsProps) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const createVoice = useCreateVoiceNoteMutation(tripId);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [denied, setDenied] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const start = async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setDenied(true);
        return;
      }
      setDenied(false);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setElapsed(0);
      setRecording(true);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch {
      setRecording(false);
    }
  };

  const stop = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const seconds = Math.max(1, elapsed);
    setRecording(false);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) return;
      const ext = (uri.split('.').pop() || 'm4a').toLowerCase();
      setUploadProgress(0);
      createVoice.mutate({
        fields: { scope, targetId, durationSeconds: seconds, locale: 'en-US' },
        audio: { uri, name: `voice-note.${ext}`, type: `audio/${ext === 'm4a' ? 'm4a' : ext}` },
        fileName: `voice-note.${ext}`,
        onProgress: setUploadProgress,
      });
    } catch {
      // recording failed — nothing persisted
    }
  };

  if (createVoice.isPending) {
    return (
      <View style={st.row}>
        <ActivityIndicator size="small" color={colors.brand} />
        <Text style={st.recText}>
          Uploading voice note{uploadProgress > 0 ? `… ${Math.round(uploadProgress * 100)}%` : '…'}
        </Text>
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
      {denied ? <Text style={st.error}>Microphone permission is needed to record.</Text> : null}
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
  error: { color: colors.danger, fontSize: 12, fontWeight: '600', marginTop: 4 },
});
