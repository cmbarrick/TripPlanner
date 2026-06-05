import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Card } from '../components';
import { colors, radius } from '../theme';
import { usePromptSettings } from './store';

/** Profile settings for reflection prompts: a global on/off and management of custom prompts.
 *  Stored on-device (offline-first); per-trip toggles live on the trip itself. */
export function PromptSettingsCard() {
  const { settings, setEnabledGlobal, addCustomPrompt, removeCustomPrompt } = usePromptSettings();
  const [draft, setDraft] = useState('');

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    // Custom prompts apply to every scope so they always surface; scope-specific custom prompts
    // can come later.
    addCustomPrompt(text, ['Event', 'Day', 'Trip']);
    setDraft('');
  };

  return (
    <>
      <Text style={s.section}>Journaling</Text>
      <Card>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.rowLabel}>Reflection prompts</Text>
            <Text style={s.rowHint}>Gentle questions to help you journal each event, day, and trip</Text>
          </View>
          <View style={s.seg}>
            {([true, false] as boolean[]).map((on) => {
              const active = settings.enabledGlobal === on;
              return (
                <Pressable
                  key={String(on)}
                  style={[s.opt, active && s.optOn]}
                  onPress={() => setEnabledGlobal(on)}
                  accessibilityLabel={on ? 'Turn prompts on' : 'Turn prompts off'}
                >
                  <Text style={[s.optText, active && s.optTextOn]}>{on ? 'On' : 'Off'}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {settings.enabledGlobal ? (
          <View style={[s.block, s.rowDivider]}>
            <Text style={s.rowLabel}>Your prompts</Text>
            <Text style={s.rowHint}>Add your own questions — they appear alongside the presets.</Text>

            <View style={s.addRow}>
              <TextInput
                style={s.input}
                placeholder="e.g. What did this place smell like?"
                placeholderTextColor={colors.ink400}
                value={draft}
                onChangeText={setDraft}
                accessibilityLabel="New custom prompt"
                onSubmitEditing={add}
                returnKeyType="done"
              />
              <Pressable
                style={[s.addBtn, !draft.trim() && { opacity: 0.5 }]}
                onPress={add}
                disabled={!draft.trim()}
                accessibilityLabel="Add custom prompt"
              >
                <Text style={s.addText}>Add</Text>
              </Pressable>
            </View>

            {settings.custom.length === 0 ? (
              <Text style={s.empty}>No custom prompts yet.</Text>
            ) : (
              settings.custom.map((p) => (
                <View key={p.id} style={s.customRow}>
                  <Text style={s.customText}>💭 {p.text}</Text>
                  <Pressable onPress={() => removeCustomPrompt(p.id)} hitSlop={8} accessibilityLabel={`Remove prompt: ${p.text}`}>
                    <Text style={s.remove}>✕</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        ) : null}
      </Card>
    </>
  );
}

const s = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '800', color: colors.ink600, marginBottom: 8, marginLeft: 2, marginTop: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowDivider: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line },
  block: {},
  rowLabel: { fontSize: 14, fontWeight: '700', color: colors.ink },
  rowHint: { fontSize: 11, color: colors.ink400, marginTop: 2 },
  seg: { flexDirection: 'row', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, padding: 3, gap: 3 },
  opt: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.sm - 2 },
  optOn: { backgroundColor: colors.brand },
  optText: { fontSize: 13, fontWeight: '800', color: colors.ink600 },
  optTextOn: { color: '#fff' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  input: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, color: colors.ink, fontSize: 13 },
  addBtn: { backgroundColor: colors.brand, paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.sm },
  addText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  empty: { fontSize: 12, color: colors.ink400, marginTop: 10 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  customText: { flex: 1, fontSize: 13, color: colors.ink, lineHeight: 18 },
  remove: { color: colors.ink400, fontSize: 14, fontWeight: '700' },
});
