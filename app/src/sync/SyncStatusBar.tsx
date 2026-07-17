import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';
import { useSyncStatus } from './useOutboxSync';

/**
 * Small "N pending" indicator for the journal, backed by the offline outbox (Phase 9). Renders
 * nothing when the queue is empty — this isn't a persistent offline/online banner, just a signal
 * that some captures haven't reached the server yet. Two states:
 *  - queued, not yet blocked: soft "⏳ N pending" (the automatic flush — on app start/foreground/
 *    the web `online` event/a 20s safety net — just hasn't run yet, or is mid-attempt).
 *  - blocked: a flush attempt actually hit a network failure with work still queued — shown as
 *    "offline" with a manual retry action, since waiting for the next automatic attempt could be
 *    up to 20s away.
 */
export function SyncStatusBar() {
  const { pendingCount, blocked, retryNow } = useSyncStatus();
  const [retrying, setRetrying] = useState(false);

  if (pendingCount === 0) return null;

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await retryNow();
    } finally {
      setRetrying(false);
    }
  };

  const label = `${pendingCount} ${pendingCount === 1 ? 'change' : 'changes'} waiting to sync`;

  return (
    <View style={[s.bar, blocked && s.barBlocked]} accessibilityLabel="Sync status">
      <Text style={[s.text, blocked && s.textBlocked]}>
        {blocked ? `🔌 Offline — ${label}` : `⏳ ${label}`}
      </Text>
      <Pressable
        onPress={retry}
        disabled={retrying}
        hitSlop={6}
        accessibilityLabel="Retry sync now"
      >
        {retrying ? (
          <ActivityIndicator size="small" color={blocked ? colors.danger : colors.brand} />
        ) : (
          <Text style={[s.retry, blocked && s.retryBlocked]}>Retry</Text>
        )}
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: colors.brand100,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  barBlocked: { backgroundColor: '#fee2e2' },
  text: { fontSize: 12, fontWeight: '700', color: colors.brand, flexShrink: 1 },
  textBlocked: { color: colors.danger },
  retry: { fontSize: 12, fontWeight: '800', color: colors.brand },
  retryBlocked: { color: colors.danger },
});
