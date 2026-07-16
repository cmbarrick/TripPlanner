import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Reaction, ReactionTargetType } from '../types';
import { colors, radius } from '../theme';
import { getAuthStateSnapshot } from '../auth/session';
import { useToggleReactionMutation } from '../queries/reactions';

const PALETTE = ['👍', '❤️', '😂', '😮', '🎉'];

/**
 * Emoji reactions on a trip/item/recap (Phase 7, Slice 4). Renders grouped emoji chips (count +
 * highlighted when the caller has reacted) plus a "+" picker from a small fixed palette. Toggling
 * is optimistic; peers' toggles arrive live via `useTripRealtime`'s `reactions` invalidation.
 */
export function ReactionBar({
  tripId,
  targetType,
  targetId,
  reactions,
  compact,
}: {
  tripId: string;
  targetType: ReactionTargetType;
  targetId: string;
  reactions: Reaction[];
  compact?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const toggle = useToggleReactionMutation(tripId);
  const ownerId = getAuthStateSnapshot().subject ?? '';

  const groups = useMemo(() => {
    const forTarget = reactions.filter((r) => r.targetType === targetType && r.targetId === targetId);
    const byEmoji = new Map<string, { count: number; mine: boolean }>();
    for (const r of forTarget) {
      const g = byEmoji.get(r.emoji) ?? { count: 0, mine: false };
      g.count += 1;
      if (r.ownerId === ownerId) g.mine = true;
      byEmoji.set(r.emoji, g);
    }
    return Array.from(byEmoji.entries()).map(([emoji, g]) => ({ emoji, ...g }));
  }, [reactions, targetType, targetId, ownerId]);

  const onToggle = (emoji: string) => {
    setPickerOpen(false);
    toggle.mutate({ targetType, targetId, emoji });
  };

  return (
    <View style={[s.row, compact && s.rowCompact]}>
      {groups.map((g) => (
        <Pressable
          key={g.emoji}
          style={[s.chip, g.mine && s.chipMine]}
          onPress={() => onToggle(g.emoji)}
          accessibilityLabel={`${g.emoji} reaction, ${g.count}${g.mine ? ', you reacted' : ''}`}
        >
          <Text style={s.chipText}>
            {g.emoji} {g.count}
          </Text>
        </Pressable>
      ))}

      <Pressable
        style={s.addBtn}
        onPress={() => setPickerOpen((v) => !v)}
        accessibilityLabel="Add reaction"
      >
        <Text style={s.addBtnText}>+</Text>
      </Pressable>

      {pickerOpen ? (
        <View style={s.picker}>
          {PALETTE.map((emoji) => (
            <Pressable key={emoji} style={s.pickerBtn} onPress={() => onToggle(emoji)} accessibilityLabel={`React with ${emoji}`}>
              <Text style={s.pickerEmoji}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  rowCompact: { gap: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipMine: { backgroundColor: colors.brand100, borderColor: colors.brand },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.ink },
  addBtn: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  addBtnText: { fontSize: 14, fontWeight: '800', color: colors.ink600, lineHeight: 16 },
  picker: {
    flexDirection: 'row',
    gap: 4,
    padding: 6,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pickerBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  pickerEmoji: { fontSize: 18 },
});
