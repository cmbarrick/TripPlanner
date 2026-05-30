import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { colors, radius } from './theme';
import { parseDate, formatDateLong, formatClock, toIsoDate } from './format';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Tappable field that opens a month-calendar popover to pick a "yyyy-MM-dd" date. */
export function DateField({
  value,
  onChange,
  placeholder = 'Select a date',
  accessibilityLabel,
}: {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  accessibilityLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const initial = value ? parseDate(value) : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth()); // 0-based

  const openPicker = () => {
    const base = value ? parseDate(value) : new Date();
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setOpen(true);
  };

  const step = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  };

  const select = (day: number) => {
    onChange(toIsoDate(viewYear, viewMonth + 1, day));
    setOpen(false);
  };

  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const selected = value ? parseDate(value) : null;

  return (
    <>
      <Pressable style={s.control} onPress={openPicker} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
        <Text style={[s.controlText, !value && s.placeholder]}>{value ? formatDateLong(value) : placeholder}</Text>
        <Text style={s.controlIcon}>📅</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.calHead}>
              <Pressable style={s.navBtn} onPress={() => step(-1)} accessibilityLabel="Previous month"><Text style={s.navText}>‹</Text></Pressable>
              <Text style={s.calTitle}>{MONTHS[viewMonth]} {viewYear}</Text>
              <Pressable style={s.navBtn} onPress={() => step(1)} accessibilityLabel="Next month"><Text style={s.navText}>›</Text></Pressable>
            </View>
            <View style={s.dowRow}>
              {DOW.map((d, i) => <Text key={i} style={s.dow}>{d}</Text>)}
            </View>
            {rows.map((row, ri) => (
              <View key={ri} style={s.calRow}>
                {row.map((d, ci) => {
                  const isSel = !!(d && selected && selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === d);
                  return (
                    <Pressable key={ci} style={s.calCell} onPress={() => d && select(d)} disabled={!d}>
                      {d ? (
                        <View style={[s.calCellInner, isSel && s.calCellOn]}>
                          <Text style={[s.calCellText, isSel && { color: '#fff' }]}>{d}</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const HOURS_24 = Array.from({ length: 24 }, (_, i) => i); // 0..23
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,...,55

/** Tappable field that opens an hour/minute popover, emitting "HH:mm:ss" (24h) or null. */
export function TimeField({
  value,
  onChange,
  placeholder = 'Add a time',
  allowClear = true,
  accessibilityLabel,
  clock = '12h',
}: {
  value: string | null;
  onChange: (time: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  accessibilityLabel?: string;
  clock?: '12h' | '24h';
}) {
  const [open, setOpen] = useState(false);
  const parsed = parseTime(value);
  const [hour24, setHour24] = useState(parsed.hour24);
  const [minute, setMinute] = useState(parsed.minute);

  const openPicker = () => {
    const p = parseTime(value);
    setHour24(p.hour24);
    setMinute(p.minute);
    setOpen(true);
  };

  const confirm = () => {
    onChange(`${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
    setOpen(false);
  };

  const clear = () => {
    onChange(null);
    setOpen(false);
  };

  const is24 = clock === '24h';
  const period: 'AM' | 'PM' = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const setHour12 = (h: number) => setHour24((h % 12) + (period === 'PM' ? 12 : 0));
  const setPeriod = (p: 'AM' | 'PM') => setHour24((hour24 % 12) + (p === 'PM' ? 12 : 0));

  return (
    <>
      <Pressable style={s.control} onPress={openPicker} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
        <Text style={[s.controlText, !value && s.placeholder]}>{value ? formatClock(value, clock) : placeholder}</Text>
        <Text style={s.controlIcon}>🕘</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.calTitle}>Pick a time</Text>
            <View style={s.timeRow}>
              {is24 ? (
                <Column data={HOURS_24} selected={hour24} onSelect={setHour24} render={(h) => String(h).padStart(2, '0')} />
              ) : (
                <Column data={HOURS_12} selected={hour12} onSelect={setHour12} render={(h) => String(h)} />
              )}
              <Text style={s.colon}>:</Text>
              <Column data={MINUTES} selected={minute} onSelect={setMinute} render={(m) => String(m).padStart(2, '0')} />
              {is24 ? null : (
                <View style={s.periodCol}>
                  {(['AM', 'PM'] as const).map((p) => {
                    const on = p === period;
                    return (
                      <Pressable key={p} style={[s.periodBtn, on && s.periodOn]} onPress={() => setPeriod(p)}>
                        <Text style={[s.periodText, on && { color: '#fff' }]}>{p}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
            <View style={s.actions}>
              {allowClear ? (
                <Pressable style={s.clearBtn} onPress={clear} accessibilityLabel="Clear time"><Text style={s.clearText}>Clear</Text></Pressable>
              ) : <View />}
              <Pressable style={s.doneBtn} onPress={confirm} accessibilityLabel="Confirm time"><Text style={s.doneText}>Done</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Column<T>({ data, selected, onSelect, render }: { data: T[]; selected: T; onSelect: (v: T) => void; render: (v: T) => string }) {
  return (
    <ScrollView style={s.wheel} contentContainerStyle={{ paddingVertical: 4 }} showsVerticalScrollIndicator={false}>
      {data.map((v, i) => {
        const on = v === selected;
        return (
          <Pressable key={i} style={[s.wheelItem, on && s.wheelItemOn]} onPress={() => onSelect(v)}>
            <Text style={[s.wheelText, on && { color: '#fff', fontWeight: '800' }]}>{render(v)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Generic single-select dropdown used for currency/timezone-style fields. */
export function SelectField<T extends string>({
  value,
  options,
  onChange,
  labelFor,
  accessibilityLabel,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  labelFor?: (v: T) => string;
  accessibilityLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const label = labelFor ? labelFor(value) : value;
  return (
    <>
      <Pressable style={s.control} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
        <Text style={s.controlText}>{label}</Text>
        <Text style={s.controlIcon}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {options.map((opt) => {
                const on = opt === value;
                return (
                  <Pressable key={opt} style={[s.selRow, on && s.selRowOn]} onPress={() => { onChange(opt); setOpen(false); }}>
                    <Text style={[s.selText, on && { color: colors.brand, fontWeight: '800' }]}>{labelFor ? labelFor(opt) : opt}</Text>
                    {on ? <Text style={{ color: colors.brand }}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function parseTime(value: string | null): { hour24: number; minute: number } {
  if (!value) return { hour24: 9, minute: 0 };
  const [hRaw, mRaw] = value.split(':');
  const h = Number(hRaw);
  const hour24 = Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 9;
  const minuteRaw = Number(mRaw ?? 0);
  const minute = MINUTES.includes(minuteRaw) ? minuteRaw : (Math.round(minuteRaw / 5) * 5) % 60;
  return { hour24, minute };
}

const s = StyleSheet.create({
  control: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12 },
  controlText: { fontSize: 13, color: colors.ink, fontWeight: '600' },
  placeholder: { color: colors.ink400, fontWeight: '400' },
  controlIcon: { fontSize: 13, color: colors.ink400 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 340, backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, shadowColor: '#0f172a', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  calTitle: { fontSize: 15, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  navBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: 20, color: colors.ink600, marginTop: -2 },
  dowRow: { flexDirection: 'row', marginBottom: 4 },
  dow: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', color: colors.ink400 },
  calRow: { flexDirection: 'row' },
  calCell: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  calCellInner: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  calCellOn: { backgroundColor: colors.brand },
  calCellText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginVertical: 12 },
  wheel: { height: 150, width: 60, backgroundColor: colors.bg, borderRadius: radius.md },
  wheelItem: { paddingVertical: 9, alignItems: 'center', borderRadius: 8, marginHorizontal: 6 },
  wheelItemOn: { backgroundColor: colors.brand },
  wheelText: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  colon: { fontSize: 20, fontWeight: '800', color: colors.ink400 },
  periodCol: { gap: 6, marginLeft: 6 },
  periodBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.bg, alignItems: 'center' },
  periodOn: { backgroundColor: colors.brand },
  periodText: { fontSize: 13, fontWeight: '800', color: colors.ink600 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  clearBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  clearText: { color: colors.ink400, fontWeight: '700', fontSize: 13 },
  doneBtn: { backgroundColor: colors.brand, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 999 },
  doneText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  selRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 13, borderRadius: radius.md },
  selRowOn: { backgroundColor: colors.brand100 },
  selText: { fontSize: 14, color: colors.ink, fontWeight: '600' },
});
