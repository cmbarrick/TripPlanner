import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { colors, radius } from '../theme';
import { Recap, PiiReviewRequiredError, PiiFinding } from '../api';
import {
  usePublishStatusQuery,
  usePublishRecapMutation,
  useUnpublishRecapMutation,
} from '../queries/discovery';

/**
 * Owner-only sheet for publishing a recap publicly (Phase 8): shows the post-trip lock explanation
 * before the trip has ended, a discovery-facets form (places/tags/season/budget), a PII review step
 * when the server finds an email/phone number, the resulting moderation status, and unpublish.
 */
export function PublishRecapSheet({
  tripId,
  tripEndDate,
  recap,
  visible,
  onClose,
}: {
  tripId: string;
  tripEndDate: string;
  recap: Recap;
  visible: boolean;
  onClose: () => void;
}) {
  const statusQuery = usePublishStatusQuery(tripId, recap.id, visible);
  const publish = usePublishRecapMutation(tripId, recap.id);
  const unpublish = useUnpublishRecapMutation(tripId, recap.id);

  const [places, setPlaces] = useState('');
  const [tags, setTags] = useState('');
  const [season, setSeason] = useState('');
  const [budgetBand, setBudgetBand] = useState('');
  const [piiFindings, setPiiFindings] = useState<PiiFinding[] | null>(null);

  const tripEnded = new Date(tripEndDate) <= new Date();
  const view = statusQuery.data;
  const published = !!view;

  const csv = (s: string) => s.split(',').map((v) => v.trim()).filter(Boolean);

  const runPublish = (acknowledgePii = false) => {
    setPiiFindings(null);
    publish.mutate(
      {
        places: csv(places),
        tags: csv(tags),
        season: season.trim() || undefined,
        budgetBand: budgetBand.trim() || undefined,
        acknowledgePii,
      },
      {
        onError: (e) => {
          if (e instanceof PiiReviewRequiredError) setPiiFindings(e.findings);
        },
      },
    );
  };

  const statusLabel = (status: string) =>
    status === 'Approved' ? 'Live — discoverable' : status === 'Pending' ? 'Under review' : 'Rejected';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.headerRow}>
          <Text style={s.title}>Publish recap</Text>
          <Pressable onPress={onClose} accessibilityLabel="Close publish sheet" hitSlop={8}>
            <Text style={s.close}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          {!tripEnded ? (
            <View style={s.lockBox}>
              <Text style={s.lockText}>
                🔒 Public recaps can only be published after your trip ends, on{' '}
                {new Date(tripEndDate).toLocaleDateString()}. This protects your safety — nothing
                broadcasts that you're away from home while you're still traveling. Private sharing
                with friends stays available any time.
              </Text>
            </View>
          ) : published ? (
            <View style={s.statusBox}>
              <Text style={s.statusText}>{statusLabel(view!.moderationStatus)}</Text>
              {view!.moderationReason ? <Text style={s.reasonText}>{view!.moderationReason}</Text> : null}
              {view!.places.length || view!.tags.length ? (
                <Text style={s.metaText}>
                  {[...(view!.places ?? []), ...(view!.tags ?? [])].join(' · ')}
                </Text>
              ) : null}
              <Pressable
                style={[s.dangerBtn, unpublish.isPending && s.btnDisabled]}
                onPress={() => unpublish.mutate()}
                disabled={unpublish.isPending}
                accessibilityLabel="Unpublish recap"
              >
                {unpublish.isPending ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <Text style={s.dangerBtnText}>Unpublish</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={s.hint}>
                Publishing shares this recap publicly and makes it searchable. Add a few facets to
                help travelers find it.
              </Text>

              <Text style={s.fieldLabel}>Places (comma-separated)</Text>
              <TextInput
                style={s.input}
                value={places}
                onChangeText={setPlaces}
                placeholder="Kyoto, Arashiyama"
                placeholderTextColor={colors.ink400}
                accessibilityLabel="Places"
              />

              <Text style={s.fieldLabel}>Tags (comma-separated)</Text>
              <TextInput
                style={s.input}
                value={tags}
                onChangeText={setTags}
                placeholder="temples, hiking, food"
                placeholderTextColor={colors.ink400}
                accessibilityLabel="Tags"
              />

              <Text style={s.fieldLabel}>Season</Text>
              <TextInput
                style={s.input}
                value={season}
                onChangeText={setSeason}
                placeholder="Spring"
                placeholderTextColor={colors.ink400}
                accessibilityLabel="Season"
              />

              <Text style={s.fieldLabel}>Budget</Text>
              <TextInput
                style={s.input}
                value={budgetBand}
                onChangeText={setBudgetBand}
                placeholder="budget / mid / luxury"
                placeholderTextColor={colors.ink400}
                accessibilityLabel="Budget band"
              />

              {piiFindings && piiFindings.length > 0 ? (
                <View style={s.piiBox}>
                  <Text style={s.piiTitle}>Possible personal info found</Text>
                  {piiFindings.map((f, i) => (
                    <Text key={i} style={s.piiLine}>
                      • {f.type}: {f.value}
                    </Text>
                  ))}
                  <Text style={s.piiHint}>
                    Edit the recap to remove it, or confirm it's fine to publish anyway (e.g. a
                    public business contact).
                  </Text>
                  <Pressable
                    style={[s.secondaryBtn, publish.isPending && s.btnDisabled]}
                    onPress={() => runPublish(true)}
                    disabled={publish.isPending}
                    accessibilityLabel="Publish anyway"
                  >
                    <Text style={s.secondaryBtnText}>Publish anyway</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={[s.primaryBtn, publish.isPending && s.btnDisabled]}
                  onPress={() => runPublish(false)}
                  disabled={publish.isPending}
                  accessibilityLabel="Publish recap"
                >
                  {publish.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={s.primaryBtnText}>Publish</Text>
                  )}
                </Pressable>
              )}
              {publish.error && !(publish.error instanceof PiiReviewRequiredError) ? (
                <Text style={s.error}>{(publish.error as Error).message}</Text>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
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
  hint: { fontSize: 12, color: colors.ink600, marginTop: 4, marginBottom: 8, lineHeight: 17 },
  lockBox: { backgroundColor: '#fef3c7', borderRadius: radius.md, padding: 12, marginTop: 8 },
  lockText: { fontSize: 12, color: '#92400e', lineHeight: 18, fontWeight: '600' },
  statusBox: { backgroundColor: colors.brand100, borderRadius: radius.md, padding: 12, marginTop: 8, gap: 6, alignItems: 'flex-start' },
  statusText: { fontSize: 14, fontWeight: '800', color: colors.brand },
  reasonText: { fontSize: 12, color: colors.ink600 },
  metaText: { fontSize: 11, color: colors.ink400 },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: colors.ink400, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.ink },
  primaryBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: 18 },
  primaryBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  secondaryBtn: { borderRadius: radius.md, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, marginTop: 10 },
  secondaryBtnText: { color: colors.ink600, fontSize: 13, fontWeight: '700' },
  dangerBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.sm, backgroundColor: '#fee2e2', marginTop: 4 },
  dangerBtnText: { fontSize: 12, fontWeight: '800', color: colors.danger },
  btnDisabled: { opacity: 0.55 },
  error: { marginTop: 8, fontSize: 11, color: '#b91c1c' },
  piiBox: { backgroundColor: '#fee2e2', borderRadius: radius.md, padding: 12, marginTop: 14, gap: 4, alignItems: 'flex-start' },
  piiTitle: { fontSize: 13, fontWeight: '800', color: colors.danger },
  piiLine: { fontSize: 12, color: colors.danger },
  piiHint: { fontSize: 11, color: '#7f1d1d', marginTop: 4, lineHeight: 16 },
});
