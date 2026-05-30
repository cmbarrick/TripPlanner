import { ItineraryItem } from './types';

const DEFAULT_DURATION_MIN = 90;

export function timeToMinutes(t?: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}

interface Interval {
  id: string;
  start: number;
  end: number;
}

/**
 * Returns the set of item ids that overlap another item on the same day.
 * Items without an end time are assumed to last DEFAULT_DURATION_MIN.
 */
export function detectConflicts(items: ItineraryItem[]): Set<string> {
  const intervals: Interval[] = items
    .map((it) => {
      const start = timeToMinutes(it.startTime);
      if (start == null) return null;
      const end = timeToMinutes(it.endTime) ?? start + DEFAULT_DURATION_MIN;
      return { id: it.id, start, end };
    })
    .filter((x): x is Interval => x !== null)
    .sort((a, b) => a.start - b.start);

  const conflicting = new Set<string>();
  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      if (intervals[j].start < intervals[i].end) {
        conflicting.add(intervals[i].id);
        conflicting.add(intervals[j].id);
      } else {
        break; // sorted by start, no further overlaps with i
      }
    }
  }
  return conflicting;
}

export function sortByTime(items: ItineraryItem[]): ItineraryItem[] {
  return [...items].sort((a, b) => {
    const ta = timeToMinutes(a.startTime) ?? Number.MAX_SAFE_INTEGER;
    const tb = timeToMinutes(b.startTime) ?? Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });
}

export function makeId(): string {
  return 'local-' + Math.random().toString(36).slice(2, 10);
}
