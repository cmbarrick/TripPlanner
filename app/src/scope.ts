import { Trip, Day, ItineraryItem } from './types';
import { detectConflicts, sortByTime } from './itinerary';

export type Scope = 'day' | 'trip';

export interface CostRollup {
  /** Total in the trip's primary currency bucket (largest by sum). */
  total: number;
  /** Per-currency totals, e.g. { EUR: 320, USD: 40 }. */
  byCurrency: Record<string, number>;
}

/**
 * Returns the days in view for a scope: a single day (Day scope) or every day (Trip scope).
 * Drives the scope-aware itinerary so Map (Phase 2) and AI (Phase 5) are purely additive.
 */
export function scopedDays(trip: Trip, scope: Scope, dayId?: string): Day[] {
  if (scope === 'trip') return trip.days;
  const day = trip.days.find((d) => d.id === dayId) ?? trip.days[0];
  return day ? [day] : [];
}

/** All itinerary items within the scope, flattened. */
export function scopedItems(trip: Trip, scope: Scope, dayId?: string): ItineraryItem[] {
  return scopedDays(trip, scope, dayId).flatMap((d) => d.items);
}

/** Sums item costs, grouped by currency (null costs ignored). */
export function costRollup(items: ItineraryItem[]): CostRollup {
  const byCurrency: Record<string, number> = {};
  for (const item of items) {
    if (item.cost == null) continue;
    const cur = item.currency || 'EUR';
    byCurrency[cur] = (byCurrency[cur] ?? 0) + item.cost;
  }
  const total = Object.values(byCurrency).reduce((a, b) => a + b, 0);
  return { total, byCurrency };
}

export interface CostSplit {
  /** Confirmed items — the committed total. */
  confirmed: CostRollup;
  /** Tentative + wishlist items — "potential" spend if added/confirmed. */
  potential: CostRollup;
}

/** Splits cost into the confirmed total vs. potential (tentative/wishlist) spend. */
export function splitCost(items: ItineraryItem[]): CostSplit {
  return {
    confirmed: costRollup(items.filter((i) => i.status === 'Confirmed')),
    potential: costRollup(items.filter((i) => i.status !== 'Confirmed')),
  };
}

export interface DaySchedule {
  /** Items with a start time, sorted chronologically (time decides their order). */
  timed: ItineraryItem[];
  /** Items with no time, in manual SortOrder — the "Anytime" group. */
  anytime: ItineraryItem[];
}

/**
 * Splits a day's items into a time-ordered list and a manually-ordered "Anytime" group.
 * Timed items sort by start time; untimed items keep their manual SortOrder.
 */
export function daySchedule(day: Day): DaySchedule {
  const timed = sortByTime(day.items.filter((i) => i.startTime));
  const anytime = [...day.items.filter((i) => !i.startTime)].sort((a, b) => a.sortOrder - b.sortOrder);
  return { timed, anytime };
}

/** The trip's unscheduled "Ideas" backlog, in manual SortOrder. */
export function tripBacklog(trip: Trip): ItineraryItem[] {
  return [...(trip.unscheduledItems ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Conflicting item ids within a single day. Only **confirmed** items participate in hard
 * conflict detection — tentative/wishlist items are pencilled in and don't trigger warnings.
 */
export function conflictIdsForDay(day: Day): Set<string> {
  return detectConflicts(day.items.filter((i) => i.status === 'Confirmed'));
}

/** Union of conflicting item ids across the scope (per-day overlaps, confirmed items only). */
export function conflictIdsForScope(trip: Trip, scope: Scope, dayId?: string): Set<string> {
  const all = new Set<string>();
  for (const day of scopedDays(trip, scope, dayId)) {
    for (const id of conflictIdsForDay(day)) all.add(id);
  }
  return all;
}

export interface ScopeSummary {
  days: number;
  stops: number;
  cost: CostRollup;
  /** Total number of items flagged as overlapping in the scope. */
  conflicts: number;
}

/** Aggregate stats for the scope, used by the planner header and cost rollup chips. */
export function scopeSummary(trip: Trip, scope: Scope, dayId?: string): ScopeSummary {
  const days = scopedDays(trip, scope, dayId);
  const items = days.flatMap((d) => d.items);
  return {
    days: days.length,
    stops: items.length,
    cost: costRollup(items),
    conflicts: conflictIdsForScope(trip, scope, dayId).size,
  };
}

/** Items sorted by start time for display within a day. */
export function dayAgenda(day: Day): ItineraryItem[] {
  return sortByTime(day.items);
}

/** Packing items aggregated across the whole trip (model attaches them to days). */
export function tripPackingItems(trip: Trip) {
  return trip.days.flatMap((d) => d.packingItems ?? []);
}
