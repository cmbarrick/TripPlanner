import React from 'react';
import { Pressable, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { colors } from '../theme';
import { formatDuration } from '../audioRecording';
import { MediaSource, useMediaSource } from '../media/useMediaSource';
import { VoicePlayerProps } from './types';

/** Native playback: resolve the best source (signed URL, else authed stream) before instantiating
 *  the player, then toggle play/pause. Resolving first keeps the audio hook's source stable. */
export function VoicePlayer({ tripId, media }: VoicePlayerProps) {
  const source = useMediaSource(tripId, media.id);
  const label = `Voice note${media.durationSeconds ? ` · ${formatDuration(media.durationSeconds)}` : ''}`;

  if (!source) {
    return (
      <Pressable style={st.play} accessibilityLabel="Loading voice note">
        <ActivityIndicator size="small" color={colors.brand} />
        <Text style={st.text}>{label}</Text>
      </Pressable>
    );
  }
  return <Player source={source} label={label} />;
}

function Player({ source, label }: { source: MediaSource; label: string }) {
  const player = useAudioPlayer({ uri: source.uri, headers: source.headers });
  const status = useAudioPlayerStatus(player);

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
