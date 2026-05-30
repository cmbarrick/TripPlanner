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
 * Drives the scope-aware itinerary so Map (Phase 2) and AI (Phase 3) are purely additive.
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

/** Conflicting item ids within a single day (overlaps only make sense within a day). */
export function conflictIdsForDay(day: Day): Set<string> {
  return detectConflicts(day.items);
}

/** Union of conflicting item ids across the scope (per-day overlaps). */
export function conflictIdsForScope(trip: Trip, scope: Scope, dayId?: string): Set<string> {
  const all = new Set<string>();
  for (const day of scopedDays(trip, scope, dayId)) {
    for (const id of detectConflicts(day.items)) all.add(id);
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
