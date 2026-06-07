import { useEffect, useState } from 'react';
import { authHeadersSnapshot, getMediaSasUrl, mediaUrl } from '../api';

/** A resolved media source: a direct (SAS) URL, or the authenticated streaming URL plus headers. */
export interface MediaSource {
  uri: string;
  headers?: Record<string, string>;
}

/**
 * Resolves the best source for a media asset (native): a short-lived signed URL when the backend
 * can issue one (fetched directly from storage, no auth header needed), otherwise the API streaming
 * endpoint with auth headers. Returns `null` until resolved so callers that feed the URI into a
 * native player/Image render only once a concrete source is known. Always resolves (falls back to
 * authenticated streaming) so playback works even when SAS is unavailable.
 */
export function useMediaSource(tripId: string, mediaId: string): MediaSource | null {
  const [source, setSource] = useState<MediaSource | null>(null);

  useEffect(() => {
    let active = true;
    const fallback: MediaSource = { uri: mediaUrl(tripId, mediaId), headers: authHeadersSnapshot() };
    getMediaSasUrl(tripId, mediaId)
      .then((url) => {
        if (active) setSource(url ? { uri: url } : fallback);
      })
      .catch(() => {
        if (active) setSource(fallback);
      });
    return () => {
      active = false;
    };
  }, [tripId, mediaId]);

  return source;
}
