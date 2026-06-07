import React, { useEffect, useState } from 'react';
import { Image, View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { colors, radius } from '../theme';
import { authHeadersSnapshot, fetchMediaObjectUrl, getMediaSasUrl, mediaUrl } from '../api';
import { MediaAsset } from '../types';

/**
 * Displays a photo media asset, preferring a direct signed (SAS) URL when the backend issues one and
 * falling back to authenticated access. On web the fallback fetches bytes into an object URL (Image
 * can't send auth headers there); on native the Image element sends the auth headers directly.
 */
export function PhotoView({ tripId, media }: { tripId: string; media: MediaAsset }) {
  const isWeb = Platform.OS === 'web';
  const [source, setSource] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    if (isWeb) {
      // fetchMediaObjectUrl prefers a SAS URL and only proxies bytes when one isn't available.
      fetchMediaObjectUrl(tripId, media.id)
        .then((u) => {
          if (!active) return;
          if (u.startsWith('blob:')) objectUrl = u; // object URLs need revoking; SAS URLs don't
          setSource({ uri: u });
        })
        .catch(() => active && setFailed(true));
    } else {
      getMediaSasUrl(tripId, media.id)
        .then((url) => {
          if (!active) return;
          setSource(url ? { uri: url } : { uri: mediaUrl(tripId, media.id), headers: authHeadersSnapshot() });
        })
        .catch(() => active && setSource({ uri: mediaUrl(tripId, media.id), headers: authHeadersSnapshot() }));
    }

    return () => {
      active = false;
      if (objectUrl) (URL as any).revokeObjectURL?.(objectUrl);
    };
  }, [isWeb, tripId, media.id]);

  if (failed) return null;
  if (!source) {
    return (
      <View style={st.placeholder}>
        <ActivityIndicator size="small" color={colors.brand} />
      </View>
    );
  }

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
