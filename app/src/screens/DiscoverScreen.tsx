import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Card, Pill } from '../components';
import { colors, radius } from '../theme';
import { SearchResult, ApiError } from '../api';
import {
  useDiscoverySearchQuery,
  useAskDiscoveryMutation,
  useReportRecapMutation,
} from '../queries/discovery';

/**
 * Public discovery (Phase 8): search published recaps by place/tag/season/budget or free text, and
 * ask the RAG assistant a grounded question with citations. Search is anonymous; asking spends the
 * caller's AI quota.
 */
export function DiscoverScreen() {
  const [mode, setMode] = useState<'search' | 'ask'>('search');

  return (
    <View style={s.root}>
      <View style={s.appbar}>
        <Text style={s.title}>Discover</Text>
      </View>
      <View style={s.modeRow}>
        <ModeBtn label="Search" on={mode === 'search'} onPress={() => setMode('search')} />
        <ModeBtn label="Ask AI" on={mode === 'ask'} onPress={() => setMode('ask')} />
      </View>
      {mode === 'search' ? <SearchPanel /> : <AskPanel />}
    </View>
  );
}

function ModeBtn({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[s.modeBtn, on && s.modeBtnOn]} onPress={onPress} accessibilityLabel={label}>
      <Text style={[s.modeBtnText, on && s.modeBtnTextOn]}>{label}</Text>
    </Pressable>
  );
}

function SearchPanel() {
  const [q, setQ] = useState('');
  const [place, setPlace] = useState('');
  const [season, setSeason] = useState('');
  const [budgetBand, setBudgetBand] = useState('');
  const [submitted, setSubmitted] = useState<{ q?: string; place?: string; season?: string; budgetBand?: string }>({});

  const query = useDiscoverySearchQuery(submitted, true);
  const results = query.data ?? [];

  const runSearch = () =>
    setSubmitted({
      q: q.trim() || undefined,
      place: place.trim() || undefined,
      season: season.trim() || undefined,
      budgetBand: budgetBand.trim() || undefined,
    });

  return (
    <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Card>
        <TextInput
          style={s.input}
          value={q}
          onChangeText={setQ}
          placeholder="Search recaps (e.g. skiing in the Alps)"
          placeholderTextColor={colors.ink400}
          onSubmitEditing={runSearch}
          accessibilityLabel="Search text"
        />
        <View style={s.facetRow}>
          <TextInput
            style={[s.input, s.facetInput]}
            value={place}
            onChangeText={setPlace}
            placeholder="Place"
            placeholderTextColor={colors.ink400}
            accessibilityLabel="Place filter"
          />
          <TextInput
            style={[s.input, s.facetInput]}
            value={season}
            onChangeText={setSeason}
            placeholder="Season"
            placeholderTextColor={colors.ink400}
            accessibilityLabel="Season filter"
          />
          <TextInput
            style={[s.input, s.facetInput]}
            value={budgetBand}
            onChangeText={setBudgetBand}
            placeholder="Budget"
            placeholderTextColor={colors.ink400}
            accessibilityLabel="Budget filter"
          />
        </View>
        <Pressable style={s.primaryBtn} onPress={runSearch} accessibilityLabel="Run search">
          <Text style={s.primaryBtnText}>Search</Text>
        </Pressable>
      </Card>

      {query.isLoading ? (
        <ActivityIndicator style={{ marginTop: 16 }} color={colors.brand} />
      ) : results.length === 0 ? (
        <Text style={s.empty}>
          {Object.keys(submitted).length === 0 ? 'Search public recaps by place, tag, season, or budget.' : 'No recaps found.'}
        </Text>
      ) : (
        results.map((r) => <ResultCard key={r.publicRecapId} result={r} />)
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function ResultCard({ result }: { result: SearchResult }) {
  const report = useReportRecapMutation();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const reported = report.isSuccess;

  return (
    <Card style={{ marginTop: 10 }}>
      <Text style={s.resultTitle}>{result.title}</Text>
      <Text style={s.resultSnippet} numberOfLines={4}>{result.snippet}</Text>
      <View style={s.pillRow}>
        {result.places.map((p) => <Pill key={p} label={p} tone="teal" />)}
        {result.season ? <Pill label={result.season} tone="orange" /> : null}
        {result.budgetBand ? <Pill label={result.budgetBand} tone="neutral" /> : null}
      </View>

      {reported ? (
        <Text style={s.reportedText}>Reported — thanks, a moderator will review this.</Text>
      ) : reporting ? (
        <View style={{ marginTop: 8 }}>
          <TextInput
            style={s.input}
            value={reason}
            onChangeText={setReason}
            placeholder="Why are you reporting this?"
            placeholderTextColor={colors.ink400}
            accessibilityLabel="Report reason"
          />
          <View style={s.reportActions}>
            <Pressable
              style={[s.dangerBtn, (!reason.trim() || report.isPending) && s.btnDisabled]}
              onPress={() => report.mutate({ publicRecapId: result.publicRecapId, reason: reason.trim() })}
              disabled={!reason.trim() || report.isPending}
              accessibilityLabel="Submit report"
            >
              <Text style={s.dangerBtnText}>Submit report</Text>
            </Pressable>
            <Pressable onPress={() => setReporting(false)} accessibilityLabel="Cancel report">
              <Text style={s.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable style={s.reportLink} onPress={() => setReporting(true)} accessibilityLabel="Report this recap">
          <Text style={s.reportLinkText}>Report</Text>
        </Pressable>
      )}
    </Card>
  );
}

function AskPanel() {
  const [question, setQuestion] = useState('');
  const ask = useAskDiscoveryMutation();

  const runAsk = () => {
    if (!question.trim() || ask.isPending) return;
    ask.mutate(question.trim());
  };

  return (
    <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Card>
        <Text style={s.hint}>Ask about a place and get an answer grounded in public trip recaps.</Text>
        <TextInput
          style={s.input}
          value={question}
          onChangeText={setQuestion}
          placeholder="What's skiing like in the Alps?"
          placeholderTextColor={colors.ink400}
          onSubmitEditing={runAsk}
          accessibilityLabel="Discovery question"
        />
        <Pressable
          style={[s.primaryBtn, (!question.trim() || ask.isPending) && s.btnDisabled]}
          onPress={runAsk}
          disabled={!question.trim() || ask.isPending}
          accessibilityLabel="Ask"
        >
          {ask.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.primaryBtnText}>Ask</Text>}
        </Pressable>
        {ask.error ? <Text style={s.error}>{(ask.error as ApiError).message}</Text> : null}
      </Card>

      {ask.data ? (
        <Card style={{ marginTop: 10 }}>
          {ask.data.hasAnswer ? (
            <>
              <Text style={s.answerText}>{ask.data.answer}</Text>
              {ask.data.citations.length > 0 ? (
                <View style={s.citeBlock}>
                  {ask.data.citations.map((c) => (
                    <Text key={c.publicRecapId} style={s.citeLine}>
                      • {c.title}{c.places.length ? ` — ${c.places.join(', ')}` : ''}
                    </Text>
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <Text style={s.empty}>No public recap answers that yet — try rephrasing or search instead.</Text>
          )}
        </Card>
      ) : null}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  appbar: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  modeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  modeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  modeBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  modeBtnText: { fontSize: 12, fontWeight: '700', color: colors.ink600 },
  modeBtnTextOn: { color: '#fff' },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  input: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.ink },
  facetRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  facetInput: { flex: 1, minWidth: 0 },
  primaryBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center', marginTop: 10 },
  primaryBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  btnDisabled: { opacity: 0.55 },
  error: { marginTop: 8, fontSize: 11, color: '#b91c1c' },
  hint: { fontSize: 12, color: colors.ink600, marginBottom: 8, lineHeight: 17 },
  empty: { fontSize: 12, color: colors.ink400, fontStyle: 'italic', marginTop: 16, textAlign: 'center' },
  resultTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  resultSnippet: { fontSize: 12, color: colors.ink600, marginTop: 4, lineHeight: 17 },
  pillRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 },
  reportLink: { marginTop: 10, alignSelf: 'flex-start' },
  reportLinkText: { fontSize: 11, color: colors.ink400, fontWeight: '700' },
  reportedText: { marginTop: 10, fontSize: 11, color: colors.ink600, fontStyle: 'italic' },
  reportActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  dangerBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: '#fee2e2' },
  dangerBtnText: { fontSize: 12, fontWeight: '800', color: colors.danger },
  cancelText: { fontSize: 12, color: colors.ink400, fontWeight: '600' },
  answerText: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  citeBlock: { marginTop: 10, backgroundColor: colors.brand100, borderRadius: radius.md, padding: 10 },
  citeLine: { fontSize: 11, color: colors.brand, lineHeight: 17, fontWeight: '600' },
});
