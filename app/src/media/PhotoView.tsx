import React, { useEffect, useState } from 'react';
import { Image, View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { colors, radius } from '../theme';
import { authHeadersSnapshot, fetchMediaObjectUrl, mediaUrl } from '../api';
import { MediaAsset } from '../types';

/**
 * Displays an authed photo media asset. On web we fetch the bytes into an object URL (Image can't
 * send auth headers there); on native the Image element sends the auth headers directly.
 */
export function PhotoView({ tripId, media }: { tripId: string; media: MediaAsset }) {
  const isWeb = Platform.OS === 'web';
  const [uri, setUri] = useState<string | null>(isWeb ? null : mediaUrl(tripId, media.id));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isWeb) return;
    let active = true;
    let objectUrl: string | null = null;
    fetchMediaObjectUrl(tripId, media.id)
      .then((u) => {
        if (active) {
          objectUrl = u;
          setUri(u);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) (URL as any).revokeObjectURL?.(objectUrl);
    };
  }, [isWeb, tripId, media.id]);

  if (failed) return null;
  if (!uri) {
    return (
      <View style={st.placeholder}>
        <ActivityIndicator size="small" color={colors.brand} />
      </View>
    );
  }

  const source = isWeb ? { uri } : { uri, headers: authHeadersSnapshot() };
  return (
    <Image
      source={source as any}
      style={st.image}
      resizeMode="cover"
      onError={() => setFailed(true)}
      accessibilityLabel="Journal photo"
    />
  );
}

const st = StyleSheet.create({
  image: { width: '100%', height: 180, borderRadius: radius.sm, backgroundColor: colors.line },
  placeholder: { width: '100%', height: 180, borderRadius: radius.sm, backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center' },
});
