import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Card, Pill } from '../components';
import { colors, radius } from '../theme';
import { ApiError, ModerationQueueItem } from '../api';
import {
  useModerationQueueQuery,
  useApproveModerationMutation,
  useRejectModerationMutation,
} from '../queries/discovery';

/**
 * Admin-gated moderation review queue (Phase 8): recaps pending review or carrying an open report.
 * The server is the real gate (`Moderation:AdminOwnerIds`) — non-admins just see a 403 here.
 */
export function ModerationQueueScreen({ onBack }: { onBack: () => void }) {
  const queue = useModerationQueueQuery();
  const forbidden = queue.error instanceof ApiError && queue.error.status === 403;

  return (
    <View style={s.root}>
      <View style={s.appbar}>
        <Pressable onPress={onBack} accessibilityLabel="Back" hitSlop={8}>
          <Text style={s.back}>‹ Back</Text>
        </Pressable>
        <Text style={s.title}>Moderation queue</Text>
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        {queue.isLoading ? (
          <ActivityIndicator style={{ marginTop: 20 }} color={colors.brand} />
        ) : forbidden ? (
          <Text style={s.empty}>You don't have access to the moderation queue.</Text>
        ) : queue.isError ? (
          <Text style={s.empty}>Couldn't load the queue. Try again.</Text>
        ) : (queue.data ?? []).length === 0 ? (
          <Text style={s.empty}>Nothing needs review.</Text>
        ) : (
          (queue.data ?? []).map((item) => <QueueCard key={item.publicRecapId} item={item} />)
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function QueueCard({ item }: { item: ModerationQueueItem }) {
  const approve = useApproveModerationMutation();
  const reject = useRejectModerationMutation();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <Card style={{ marginTop: 10 }}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>Recap {item.recapId.slice(0, 8)}</Text>
        <Pill
          label={item.moderationStatus}
          tone={item.moderationStatus === 'Rejected' ? 'danger' : item.moderationStatus === 'Approved' ? 'ok' : 'warn'}
        />
      </View>
      {item.openReportCount > 0 ? (
        <Text style={s.reportCount}>{item.openReportCount} open {item.openReportCount === 1 ? 'report' : 'reports'}</Text>
      ) : null}
      {item.moderationReason ? <Text style={s.reason}>{item.moderationReason}</Text> : null}

      {rejecting ? (
        <View style={{ marginTop: 10 }}>
          <TextInput
            style={s.input}
            value={reason}
            onChangeText={setReason}
            placeholder="Reason for rejection"
            placeholderTextColor={colors.ink400}
            accessibilityLabel="Rejection reason"
          />
          <View style={s.actions}>
            <Pressable
              style={[s.dangerBtn, (!reason.trim() || reject.isPending) && s.btnDisabled]}
              onPress={() => reject.mutate({ publicRecapId: item.publicRecapId, reason: reason.trim() })}
              disabled={!reason.trim() || reject.isPending}
              accessibilityLabel="Confirm reject"
            >
              <Text style={s.dangerBtnText}>Confirm reject</Text>
            </Pressable>
            <Pressable onPress={() => setRejecting(false)} accessibilityLabel="Cancel reject">
              <Text style={s.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={s.actions}>
          <Pressable
            style={[s.approveBtn, approve.isPending && s.btnDisabled]}
            onPress={() => approve.mutate(item.publicRecapId)}
            disabled={approve.isPending}
            accessibilityLabel="Approve"
          >
            <Text style={s.approveBtnText}>Approve</Text>
          </Pressable>
          <Pressable
            style={s.dangerBtn}
            onPress={() => setRejecting(true)}
            accessibilityLabel="Reject"
          >
            <Text style={s.dangerBtnText}>Reject</Text>
          </Pressable>
        </View>
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  appbar: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10 },
  back: { fontSize: 13, color: colors.brand, fontWeight: '700', marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  empty: { fontSize: 12, color: colors.ink400, fontStyle: 'italic', marginTop: 20, textAlign: 'center' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  reportCount: { fontSize: 11, color: colors.danger, fontWeight: '700', marginTop: 6 },
  reason: { fontSize: 11, color: colors.ink600, marginTop: 4 },
  input: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.ink },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  approveBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.sm, backgroundColor: colors.brand },
  approveBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  dangerBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.sm, backgroundColor: '#fee2e2' },
  dangerBtnText: { fontSize: 12, fontWeight: '800', color: colors.danger },
  cancelText: { fontSize: 12, color: colors.ink400, fontWeight: '600', paddingVertical: 9 },
  btnDisabled: { opacity: 0.55 },
});
