import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Card } from '../components';
import { colors, radius } from '../theme';
import { AuthState } from '../auth/session';
import { PromptSettingsCard } from '../prompts/PromptSettingsCard';
import { NotificationSettingsCard } from '../notifications/NotificationSettingsCard';
import {
  BUDGET_OPTIONS,
  DIET_OPTIONS,
  PACE_OPTIONS,
  TRAVEL_STYLE_OPTIONS,
  usePreferencesQuery,
  useUpdatePreferencesMutation,
} from '../queries/preferences';

export type TempUnit = 'F' | 'C';
export type ClockPref = '12h' | '24h';

export function ProfileScreen({
  unit,
  onChangeUnit,
  clock,
  onChangeClock,
  auth,
  authLoading,
  authBusy,
  entraConfigured,
  authError,
  onSignIn,
  onSignOut,
}: {
  unit: TempUnit;
  onChangeUnit: (u: TempUnit) => void;
  clock: ClockPref;
  onChangeClock: (c: ClockPref) => void;
  auth: AuthState;
  authLoading: boolean;
  authBusy: boolean;
  entraConfigured: boolean;
  authError: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  const userName = auth.displayName ?? (auth.mode === 'dev-bypass' ? 'Local Dev User' : 'Traveler');
  const userEmail = auth.email ?? (auth.subject ? `${auth.subject.slice(0, 12)}...` : 'Not signed in');
  const authModeLabel =
    auth.mode === 'entra' ? 'Entra session' : auth.mode === 'dev-bypass' ? 'Development bypass' : 'Signed out';

  const prefsEnabled = auth.isAuthenticated;
  const prefsQuery = usePreferencesQuery(prefsEnabled);
  const updatePrefs = useUpdatePreferencesMutation();
  const prefs = prefsQuery.data?.data;
  const prefsLive = prefsQuery.data?.live ?? false;
  const syncedTempRef = useRef(false);

  useEffect(() => {
    if (!prefsLive || !prefs || syncedTempRef.current) return;
    syncedTempRef.current = true;
    if (prefs.temperatureUnit !== unit) onChangeUnit(prefs.temperatureUnit);
  }, [prefsLive, prefs, unit, onChangeUnit]);

  const saveTravelPref = (patch: Parameters<typeof updatePrefs.mutate>[0]) => {
    if (!prefsLive) return;
    updatePrefs.mutate(patch);
  };

  const changeUnit = (u: TempUnit) => {
    onChangeUnit(u);
    if (prefsLive) updatePrefs.mutate({ temperatureUnit: u });
  };

  return (
    <View style={s.root}>
      <View style={s.appbar}>
        <Text style={s.title}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <Card style={s.userCard}>
          <View style={s.avatar}>
            <Text style={{ fontSize: 22 }}>👤</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{authLoading ? 'Loading session...' : userName}</Text>
            <Text style={s.email}>{userEmail}</Text>
            <Text style={s.mode}>{authModeLabel}</Text>
          </View>
        </Card>

        <Card>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Account session</Text>
              <Text style={s.rowHint}>
                {entraConfigured
                  ? 'Use Entra sign-in for bearer-token API requests.'
                  : 'Set EXPO_PUBLIC_AUTH_ISSUER and EXPO_PUBLIC_AUTH_CLIENT_ID to enable Entra sign-in.'}
              </Text>
            </View>
            {auth.isAuthenticated && auth.mode === 'entra' ? (
              <Pressable style={[s.authBtn, s.signOutBtn]} onPress={onSignOut} disabled={authBusy}>
                <Text style={s.authBtnText}>{authBusy ? 'Signing out…' : 'Sign out'}</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[s.authBtn, !entraConfigured && s.authBtnDisabled]}
                onPress={onSignIn}
                disabled={authBusy || !entraConfigured}
              >
                <Text style={s.authBtnText}>{authBusy ? 'Signing in…' : 'Sign in'}</Text>
              </Pressable>
            )}
          </View>
          {authError ? <Text style={s.error}>{authError}</Text> : null}
        </Card>

        <Text style={s.section}>Display</Text>
        <Card>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Temperature</Text>
              <Text style={s.rowHint}>Units shown across the app</Text>
            </View>
            <View style={s.seg}>
              {(['F', 'C'] as TempUnit[]).map((u) => {
                const on = u === unit;
                return (
                  <Pressable key={u} style={[s.opt, on && s.optOn]} onPress={() => changeUnit(u)}>
                    <Text style={[s.optText, on && s.optTextOn]}>°{u}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[s.row, s.rowDivider]}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Clock</Text>
              <Text style={s.rowHint}>How times appear on itineraries (on-device)</Text>
            </View>
            <View style={s.seg}>
              {(['12h', '24h'] as ClockPref[]).map((c) => {
                const on = c === clock;
                return (
                  <Pressable key={c} style={[s.opt, on && s.optOn]} onPress={() => onChangeClock(c)} accessibilityLabel={`${c} clock`}>
                    <Text style={[s.optText, on && s.optTextOn]}>{c}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Card>

        <Text style={s.section}>Travel planning</Text>
        <Card>
          {!prefsEnabled ? (
            <Text style={s.rowHint}>Sign in to save planning preferences for the AI assistant.</Text>
          ) : prefsQuery.isLoading ? (
            <View style={s.loadingRow}>
              <ActivityIndicator color={colors.brand} />
              <Text style={s.rowHint}>Loading preferences…</Text>
            </View>
          ) : (
            <>
              <PreferenceRow
                label="Travel style"
                hint="What kind of trip you usually enjoy"
                options={TRAVEL_STYLE_OPTIONS}
                value={prefs?.travelStyle ?? null}
                onChange={(travelStyle) => saveTravelPref({ travelStyle })}
                disabled={!prefsLive || updatePrefs.isPending}
                wrap
              />
              <PreferenceRow
                label="Pace"
                hint="How packed your days should feel"
                options={PACE_OPTIONS}
                value={prefs?.pace ?? null}
                onChange={(pace) => saveTravelPref({ pace })}
                disabled={!prefsLive || updatePrefs.isPending}
                divider
              />
              <PreferenceRow
                label="Diet"
                hint="Restaurant and food-stop constraints"
                options={DIET_OPTIONS}
                value={prefs?.diet ?? null}
                onChange={(diet) => saveTravelPref({ diet })}
                disabled={!prefsLive || updatePrefs.isPending}
                divider
                wrap
              />
              <PreferenceRow
                label="Budget"
                hint="Typical spend band for suggestions"
                options={BUDGET_OPTIONS}
                value={prefs?.budgetBand ?? null}
                onChange={(budgetBand) => saveTravelPref({ budgetBand })}
                disabled={!prefsLive || updatePrefs.isPending}
                divider
              />
              {!prefsLive ? (
                <Text style={[s.rowHint, { marginTop: 10 }]}>
                  Connect to the API to sync planning preferences across devices.
                </Text>
              ) : null}
            </>
          )}
        </Card>

        <PromptSettingsCard />

        <NotificationSettingsCard />

        <Text style={s.note}>
          Display settings (temperature, clock) stay on-device until synced via the preferences API.
          Travel planning preferences sync to your account when the API is reachable.
        </Text>
      </ScrollView>
    </View>
  );
}

function PreferenceRow<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
  disabled,
  divider,
  wrap,
}: {
  label: string;
  hint: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  divider?: boolean;
  wrap?: boolean;
}) {
  return (
    <View style={[s.row, divider && s.rowDivider, wrap && s.rowStack]}>
      <View style={{ flex: 1, minWidth: 120 }}>
        <Text style={s.rowLabel}>{label}</Text>
        <Text style={s.rowHint}>{hint}</Text>
      </View>
      <View style={[s.seg, wrap && s.segWrap]}>
        {options.map((opt) => {
          const on = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              style={[s.opt, wrap && s.optCompact, on && s.optOn, disabled && s.optDisabled]}
              onPress={() => onChange(opt.value)}
              disabled={disabled}
              accessibilityLabel={`${label}: ${opt.label}`}
            >
              <Text style={[s.optText, wrap && s.optTextCompact, on && s.optTextOn]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  appbar: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand100, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '800', color: colors.ink },
  email: { fontSize: 12, color: colors.ink400, marginTop: 2 },
  mode: { fontSize: 11, color: colors.ink400, marginTop: 2 },
  section: { fontSize: 13, fontWeight: '800', color: colors.ink600, marginBottom: 8, marginLeft: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowStack: { flexDirection: 'column', alignItems: 'stretch' },
  rowDivider: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line },
  rowLabel: { fontSize: 14, fontWeight: '700', color: colors.ink },
  rowHint: { fontSize: 11, color: colors.ink400, marginTop: 2 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  authBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
  },
  signOutBtn: {
    backgroundColor: colors.ink400,
  },
  authBtnDisabled: {
    backgroundColor: colors.line,
  },
  authBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  error: { marginTop: 10, fontSize: 11, color: '#b91c1c' },
  seg: { flexDirection: 'row', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, padding: 3, gap: 3 },
  segWrap: { flexWrap: 'wrap', alignSelf: 'stretch' },
  opt: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.sm - 2 },
  optCompact: { paddingHorizontal: 10, paddingVertical: 5 },
  optOn: { backgroundColor: colors.brand },
  optDisabled: { opacity: 0.55 },
  optText: { fontSize: 13, fontWeight: '800', color: colors.ink600 },
  optTextCompact: { fontSize: 12 },
  optTextOn: { color: '#fff' },
  note: { fontSize: 11, color: colors.ink400, marginTop: 16, lineHeight: 16, marginHorizontal: 2 },
});
