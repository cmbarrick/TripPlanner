import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Card } from '../components';
import { colors, radius } from '../theme';
import { ItineraryItemType } from '../types';
import { useNotificationSettings } from './settings';
import { ensureNotificationPermission } from './notifier';

const DELAY_OPTIONS = [0, 15, 30, 60];
const TYPE_OPTIONS: { type: ItineraryItemType; label: string }[] = [
  { type: 'Food', label: 'Meals' },
  { type: 'Activity', label: 'Activities' },
  { type: 'Transport', label: 'Transport' },
  { type: 'Flight', label: 'Flights' },
  { type: 'Lodging', label: 'Stays' },
];

const QUIET_START = 22;
const QUIET_END = 8;

/** Profile settings for post-event reflection nudges (local notifications). Offline-first; the
 *  schedule is recomputed on-device whenever these settings or the trips change. */
export function NotificationSettingsCard() {
  const { settings, setEnabled, setDelayMinutes, toggleEventType, setQuietHours } =
    useNotificationSettings();
  const [permissionDenied, setPermissionDenied] = useState(false);

  const toggleEnabled = async (on: boolean) => {
    if (on) {
      const granted = await ensureNotificationPermission();
      setPermissionDenied(!granted);
    } else {
      setPermissionDenied(false);
    }
    await setEnabled(on);
  };

  const quietOn = settings.quietStartHour !== settings.quietEndHour;
  const delayLabel = (m: number) => (m === 0 ? 'Now' : m >= 60 ? '1 hr' : `${m} min`);

  return (
    <>
      <Text style={s.section}>Reminders</Text>
      <Card>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.rowLabel}>Post-event nudges</Text>
            <Text style={s.rowHint}>A gentle reminder to journal after an event ends</Text>
          </View>
          <View style={s.seg}>
            {([true, false] as boolean[]).map((on) => {
              const active = settings.enabled === on;
              return (
                <Pressable
                  key={String(on)}
                  style={[s.opt, active && s.optOn]}
                  onPress={() => toggleEnabled(on)}
                  accessibilityLabel={on ? 'Turn nudges on' : 'Turn nudges off'}
                >
                  <Text style={[s.optText, active && s.optTextOn]}>{on ? 'On' : 'Off'}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {settings.enabled && permissionDenied ? (
          <Text style={s.warn}>
            Notifications are blocked. Enable them for Wander in your device settings to receive nudges.
          </Text>
        ) : null}

        {settings.enabled ? (
          <>
            <View style={[s.block, s.rowDivider]}>
              <Text style={s.rowLabel}>Remind me</Text>
              <Text style={s.rowHint}>How long after an event ends</Text>
              <View style={s.chips}>
                {DELAY_OPTIONS.map((m) => {
                  const active = settings.delayMinutes === m;
                  return (
                    <Pressable
                      key={m}
                      style={[s.chip, active && s.chipOn]}
                      onPress={() => setDelayMinutes(m)}
                      accessibilityLabel={`Remind ${delayLabel(m)} after`}
                    >
                      <Text style={[s.chipText, active && s.chipTextOn]}>{delayLabel(m)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={[s.block, s.rowDivider]}>
              <Text style={s.rowLabel}>For which events</Text>
              <Text style={s.rowHint}>Only these types get a nudge</Text>
              <View style={s.chips}>
                {TYPE_OPTIONS.map(({ type, label }) => {
                  const active = settings.eventTypes.includes(type);
                  return (
                    <Pressable
                      key={type}
                      style={[s.chip, active && s.chipOn]}
                      onPress={() => toggleEventType(type)}
                      accessibilityLabel={`${active ? 'Disable' : 'Enable'} nudges for ${label}`}
                    >
                      <Text style={[s.chipText, active && s.chipTextOn]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={[s.row, s.rowDivider]}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>Quiet hours</Text>
                <Text style={s.rowHint}>Hold nudges overnight (10pm–8am) until morning</Text>
              </View>
              <View style={s.seg}>
                {([true, false] as boolean[]).map((on) => {
                  const active = quietOn === on;
                  return (
                    <Pressable
                      key={String(on)}
                      style={[s.opt, active && s.optOn]}
                      onPress={() => setQuietHours(on ? QUIET_START : 0, on ? QUIET_END : 0)}
                      accessibilityLabel={on ? 'Quiet hours on' : 'Quiet hours off'}
                    >
                      <Text style={[s.optText, active && s.optTextOn]}>{on ? 'On' : 'Off'}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </>
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
  warn: { fontSize: 11, color: '#b45309', marginTop: 10, lineHeight: 16 },
  seg: { flexDirection: 'row', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, padding: 3, gap: 3 },
  opt: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.sm - 2 },
  optOn: { backgroundColor: colors.brand },
  optText: { fontSize: 13, fontWeight: '800', color: colors.ink600 },
  optTextOn: { color: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.ink600 },
  chipTextOn: { color: '#fff' },
});
