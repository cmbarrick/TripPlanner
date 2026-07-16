import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  Share,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, radius } from '../theme';
import { TripRole } from '../types';
import {
  getTripShares,
  createTripShare,
  revokeTripShare,
  shareAbsoluteUrl,
  getTripMembers,
  inviteTripMember,
  changeTripMemberRole,
  removeTripMember,
  getConsent,
  updateConsent,
  ApiError,
} from '../api';

type ShareableRole = Exclude<TripRole, 'Owner'>;

/**
 * Owner-only sheet for sharing a trip (Phase 7): mint/revoke capability links and manage account
 * members (invite by email, change role, remove). Only mounted when the caller can manage the trip.
 */
export function ShareTripSheet({
  tripId,
  visible,
  onClose,
}: {
  tripId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const sharesKey = ['trip-shares', tripId];
  const membersKey = ['trip-members', tripId];

  const sharesQuery = useQuery({ queryKey: sharesKey, queryFn: () => getTripShares(tripId), enabled: visible });
  const membersQuery = useQuery({ queryKey: membersKey, queryFn: () => getTripMembers(tripId), enabled: visible });
  const consentKey = ['consent'];
  const consentQuery = useQuery({ queryKey: consentKey, queryFn: getConsent, enabled: visible });
  const shareDisabled = consentQuery.data?.shareEnabled === false;

  const [linkRole, setLinkRole] = useState<ShareableRole>('Viewer');
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ShareableRole>('Viewer');
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refreshShares = () => qc.invalidateQueries({ queryKey: sharesKey });
  const refreshMembers = () => qc.invalidateQueries({ queryKey: membersKey });
  const showError = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');

  const enableSharing = useMutation({
    mutationFn: () => updateConsent({ shareEnabled: true }),
    onSuccess: (settings) => qc.setQueryData(consentKey, settings),
    onError: showError,
  });

  const createLink = useMutation({
    mutationFn: () => createTripShare(tripId, linkRole),
    onSuccess: refreshShares,
    onError: showError,
  });
  const revoke = useMutation({
    mutationFn: (shareId: string) => revokeTripShare(tripId, shareId),
    onSuccess: refreshShares,
    onError: showError,
  });
  const invite = useMutation({
    mutationFn: () => inviteTripMember(tripId, email.trim(), inviteRole),
    onSuccess: () => {
      setEmail('');
      refreshMembers();
    },
    onError: showError,
  });
  const setRole = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: ShareableRole }) =>
      changeTripMemberRole(tripId, memberId, role),
    onSuccess: refreshMembers,
    onError: showError,
  });
  const remove = useMutation({
    mutationFn: (memberId: string) => removeTripMember(tripId, memberId),
    onSuccess: refreshMembers,
    onError: showError,
  });

  const copyLink = async (shareId: string, url: string) => {
    const absolute = shareAbsoluteUrl(url);
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(absolute);
      } else {
        await Share.share({ message: absolute });
      }
      setCopiedId(shareId);
      setTimeout(() => setCopiedId((c) => (c === shareId ? null : c)), 1800);
    } catch {
      // User dismissed the share sheet or clipboard blocked — non-fatal.
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.headerRow}>
          <Text style={s.title}>Share trip</Text>
          <Pressable onPress={onClose} accessibilityLabel="Close share sheet" hitSlop={8}>
            <Text style={s.close}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          {error ? (
            <Pressable onPress={() => setError(null)} style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
            </Pressable>
          ) : null}

          {shareDisabled ? (
            <View style={s.consentBox}>
              <Text style={s.consentText}>
                Sharing is off for your account. Turn it on to create links or invite members.
              </Text>
              <Pressable
                style={[s.primaryBtn, enableSharing.isPending && s.btnDisabled]}
                onPress={() => enableSharing.mutate()}
                disabled={enableSharing.isPending}
                accessibilityLabel="Enable sharing"
              >
                {enableSharing.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.primaryBtnText}>Enable sharing</Text>
                )}
              </Pressable>
            </View>
          ) : null}

          {/* ── Share links ─────────────────────────────────────────── */}
          <Text style={s.section}>Invite by link</Text>
          <Text style={s.hint}>Anyone with the link can open the trip with the chosen access.</Text>
          <View style={s.rolePickerRow}>
            <RolePicker value={linkRole} onChange={setLinkRole} />
            <Pressable
              style={[s.primaryBtn, (createLink.isPending || shareDisabled) && s.btnDisabled]}
              onPress={() => createLink.mutate()}
              disabled={createLink.isPending || shareDisabled}
              accessibilityLabel="Create share link"
            >
              {createLink.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.primaryBtnText}>Create link</Text>
              )}
            </Pressable>
          </View>

          {sharesQuery.isLoading ? (
            <ActivityIndicator style={{ marginVertical: 10 }} color={colors.brand} />
          ) : (sharesQuery.data ?? []).length === 0 ? (
            <Text style={s.empty}>No active links.</Text>
          ) : (
            (sharesQuery.data ?? []).map((link) => (
              <View key={link.id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>
                    {shareAbsoluteUrl(link.shareUrl)}
                  </Text>
                  <Text style={s.rowSub}>
                    {link.role} · {link.expiresAt ? `expires ${new Date(link.expiresAt).toLocaleDateString()}` : 'no expiry'}
                  </Text>
                </View>
                <Pressable style={s.ghostBtn} onPress={() => copyLink(link.id, link.shareUrl)} accessibilityLabel="Copy link">
                  <Text style={s.ghostBtnText}>{copiedId === link.id ? 'Copied' : 'Copy'}</Text>
                </Pressable>
                <Pressable style={s.dangerBtn} onPress={() => revoke.mutate(link.id)} accessibilityLabel="Revoke link">
                  <Text style={s.dangerBtnText}>Revoke</Text>
                </Pressable>
              </View>
            ))
          )}

          {/* ── Members ─────────────────────────────────────────────── */}
          <Text style={[s.section, { marginTop: 22 }]}>Members</Text>
          <Text style={s.hint}>Invite a registered teammate by email.</Text>
          <View style={s.inviteRow}>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              placeholder="name@example.com"
              placeholderTextColor={colors.ink400}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
          </View>
          <View style={s.rolePickerRow}>
            <RolePicker value={inviteRole} onChange={setInviteRole} />
            <Pressable
              style={[s.primaryBtn, (invite.isPending || !email.trim() || shareDisabled) && s.btnDisabled]}
              onPress={() => invite.mutate()}
              disabled={invite.isPending || !email.trim() || shareDisabled}
              accessibilityLabel="Invite member"
            >
              {invite.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.primaryBtnText}>Invite</Text>
              )}
            </Pressable>
          </View>

          {membersQuery.isLoading ? (
            <ActivityIndicator style={{ marginVertical: 10 }} color={colors.brand} />
          ) : (membersQuery.data ?? []).length === 0 ? (
            <Text style={s.empty}>No members yet.</Text>
          ) : (
            (membersQuery.data ?? []).map((member) => (
              <View key={member.id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{member.email}</Text>
                  <Text style={s.rowSub}>{member.role}</Text>
                </View>
                <RolePicker
                  value={member.role === 'Owner' ? 'Editor' : member.role}
                  onChange={(role) => setRole.mutate({ memberId: member.id, role })}
                  compact
                />
                <Pressable style={s.dangerBtn} onPress={() => remove.mutate(member.id)} accessibilityLabel="Remove member">
                  <Text style={s.dangerBtnText}>Remove</Text>
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function RolePicker({
  value,
  onChange,
  compact,
}: {
  value: Exclude<TripRole, 'Owner'>;
  onChange: (role: Exclude<TripRole, 'Owner'>) => void;
  compact?: boolean;
}) {
  return (
    <View style={[s.seg, compact && { marginRight: 8 }]}>
      {(['Viewer', 'Editor'] as const).map((role) => {
        const on = role === value;
        return (
          <Pressable
            key={role}
            style={[s.segBtn, on && s.segBtnOn]}
            onPress={() => onChange(role)}
            accessibilityLabel={`${role} role`}
          >
            <Text style={[s.segText, on && s.segTextOn]}>{role}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 999, backgroundColor: colors.line, marginVertical: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink },
  close: { fontSize: 18, color: colors.ink600, paddingHorizontal: 6 },
  section: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 10 },
  hint: { fontSize: 12, color: colors.ink600, marginTop: 2, marginBottom: 8 },
  rolePickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  seg: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  segBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  segBtnOn: { backgroundColor: colors.brand },
  segText: { fontSize: 12, fontWeight: '700', color: colors.ink600 },
  segTextOn: { color: '#fff' },
  primaryBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', minWidth: 96 },
  primaryBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  btnDisabled: { opacity: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  rowTitle: { fontSize: 12, fontWeight: '700', color: colors.ink },
  rowSub: { fontSize: 11, color: colors.ink600, marginTop: 2 },
  ghostBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.brand100 },
  ghostBtnText: { fontSize: 12, fontWeight: '800', color: colors.brand },
  dangerBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: '#fee2e2' },
  dangerBtnText: { fontSize: 12, fontWeight: '800', color: colors.danger },
  inviteRow: { marginBottom: 8 },
  input: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.ink },
  empty: { fontSize: 12, color: colors.ink400, fontStyle: 'italic', marginVertical: 6 },
  errorBox: { backgroundColor: '#fee2e2', borderRadius: radius.md, padding: 10, marginBottom: 10 },
  errorText: { color: colors.danger, fontSize: 12, fontWeight: '600' },
  consentBox: { backgroundColor: colors.brand100, borderRadius: radius.md, padding: 12, marginBottom: 12, gap: 8, alignItems: 'flex-start' },
  consentText: { fontSize: 12, color: colors.ink, fontWeight: '600' },
});
