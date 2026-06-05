import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Card } from '../components';
import { colors, radius } from '../theme';
import { AuthState } from '../auth/session';
import { PromptSettingsCard } from '../prompts/PromptSettingsCard';

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

        <Text style={s.section}>Preferences</Text>
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
                  <Pressable key={u} style={[s.opt, on && s.optOn]} onPress={() => onChangeUnit(u)}>
                    <Text style={[s.optText, on && s.optTextOn]}>°{u}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[s.row, s.rowDivider]}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Clock</Text>
              <Text style={s.rowHint}>How times appear on itineraries</Text>
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

        <PromptSettingsCard />

        <Text style={s.note}>
          Preferences are stored on-device for now. Server-backed profile sync lands when preferences API
          endpoints are implemented in a later phase.
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  appbar: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  body: { paddingHorizontal: 16, paddingTop: 4 },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand100, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '800', color: colors.ink },
  email: { fontSize: 12, color: colors.ink400, marginTop: 2 },
  mode: { fontSize: 11, color: colors.ink400, marginTop: 2 },
  section: { fontSize: 13, fontWeight: '800', color: colors.ink600, marginBottom: 8, marginLeft: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowDivider: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line },
  rowLabel: { fontSize: 14, fontWeight: '700', color: colors.ink },
  rowHint: { fontSize: 11, color: colors.ink400, marginTop: 2 },
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
  opt: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.sm - 2 },
  optOn: { backgroundColor: colors.brand },
  optText: { fontSize: 13, fontWeight: '800', color: colors.ink600 },
  optTextOn: { color: '#fff' },
  note: { fontSize: 11, color: colors.ink400, marginTop: 16, lineHeight: 16, marginHorizontal: 2 },
});
