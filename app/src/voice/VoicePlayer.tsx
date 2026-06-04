import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { colors } from '../theme';
import { formatDuration } from '../audioRecording';
import { authHeadersSnapshot, mediaUrl } from '../api';
import { VoicePlayerProps } from './types';

/** Native playback: stream the authed audio URL via expo-audio and toggle play/pause. */
export function VoicePlayer({ tripId, media }: VoicePlayerProps) {
  const player = useAudioPlayer({ uri: mediaUrl(tripId, media.id), headers: authHeadersSnapshot() });
  const status = useAudioPlayerStatus(player);
  const label = `Voice note${media.durationSeconds ? ` · ${formatDuration(media.durationSeconds)}` : ''}`;

  const toggle = () => {
    if (status.playing) player.pause();
    else player.play();
  };

  return (
    <Pressable style={st.play} onPress={toggle} accessibilityLabel={status.playing ? 'Pause voice note' : 'Play voice note'}>
      <Text style={st.icon}>{status.playing ? '⏸' : '▶'}</Text>
      <Text style={st.text}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  play: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { fontSize: 14, color: colors.brand, fontWeight: '800' },
  text: { fontSize: 13, color: colors.ink, fontWeight: '700' },
});
