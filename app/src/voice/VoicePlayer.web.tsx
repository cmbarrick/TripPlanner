import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { audioPlaybackSupported, formatDuration } from '../audioRecording';
import { fetchMediaObjectUrl } from '../api';
import { VoicePlayerProps } from './types';

/** Web playback: lazily fetch the authed audio blob into an <audio> element and toggle play/pause. */
export function VoicePlayer({ tripId, media }: VoicePlayerProps) {
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<any>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => () => {
    try {
      audioRef.current?.pause?.();
    } catch {
      // ignore
    }
    if (urlRef.current) (URL as any).revokeObjectURL?.(urlRef.current);
  }, []);

  const label = `Voice note${media.durationSeconds ? ` · ${formatDuration(media.durationSeconds)}` : ''}`;

  if (!audioPlaybackSupported) {
    return <Text style={st.muted}>🎧 {label} (play on web)</Text>;
  }

  const toggle = async () => {
    try {
      if (playing && audioRef.current) {
        audioRef.current.pause();
        setPlaying(false);
        return;
      }
      if (!audioRef.current) {
        setLoading(true);
        const url = await fetchMediaObjectUrl(tripId, media.id);
        urlRef.current = url;
        const audio = new (globalThis as any).Audio(url);
        audio.onended = () => setPlaying(false);
        audioRef.current = audio;
        setLoading(false);
      }
      await audioRef.current.play();
      setPlaying(true);
    } catch {
      setLoading(false);
      setPlaying(false);
    }
  };

  return (
    <Pressable style={st.play} onPress={toggle} accessibilityLabel={playing ? 'Pause voice note' : 'Play voice note'}>
      {loading ? <ActivityIndicator size="small" color={colors.brand} /> : <Text style={st.icon}>{playing ? '⏸' : '▶'}</Text>}
      <Text style={st.text}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  play: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { fontSize: 14, color: colors.brand, fontWeight: '800' },
  text: { fontSize: 13, color: colors.ink, fontWeight: '700' },
  muted: { fontSize: 12, color: colors.ink600, fontWeight: '600' },
});
