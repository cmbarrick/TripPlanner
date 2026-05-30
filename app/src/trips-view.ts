import { Trip } from './types';
import { parseDate } from './format';

export type TripSort = 'date' | 'name';

export interface TripsView {
  upcoming: Trip[];
  past: Trip[];
}

/** Case-insensitive match on title or destination. */
export function filterTrips(trips: Trip[], query: string): Trip[] {
  const q = query.trim().toLowerCase();
  if (!q) return trips;
  return trips.filter(
    (t) =>
      t.title.toLowerCase().includes(q) || t.destination.toLowerCase().includes(q)
  );
}

/**
 * A trip is "upcoming" while its end date has not passed (compared at day
 * granularity), otherwise it is "past".
 */
export function isUpcoming(trip: Trip, now: Date = new Date()): boolean {
  const end = parseDate(trip.endDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return end.getTime() >= today.getTime();
}

function byNameThenDate(a: Trip, b: Trip): number {
  const name = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  return name !== 0 ? name : parseDate(a.startDate).getTime() - parseDate(b.startDate).getTime();
}

function sortGroup(trips: Trip[], sort: TripSort, ascendingByDate: boolean): Trip[] {
  const sorted = [...trips];
  if (sort === 'name') {
    sorted.sort(byNameThenDate);
    return sorted;
  }
  sorted.sort((a, b) => {
    const diff = parseDate(a.startDate).getTime() - parseDate(b.startDate).getTime();
    return ascendingByDate ? diff : -diff;
  });
  return sorted;
}

/**
 * Filters by query, splits into upcoming/past, and sorts each group.
 * - Upcoming trips are ordered soonest-first; past trips most-recent-first.
 * - Name sort orders both groups alphabetically.
 */
export function buildTripsView(
  trips: Trip[],
  options: { query?: string; sort?: TripSort } = {},
  now: Date = new Date()
): TripsView {
  const { query = '', sort = 'date' } = options;
  const filtered = filterTrips(trips, query);
  const upcoming = sortGroup(
    filtered.filter((t) => isUpcoming(t, now)),
    sort,
    true
  );
  const past = sortGroup(
    filtered.filter((t) => !isUpcoming(t, now)),
    sort,
    false
  );
  return { upcoming, past };
}
