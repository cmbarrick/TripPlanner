import { buildTripsView, filterTrips, isUpcoming } from './trips-view';
import { Trip } from './types';

function makeTrip(over: Partial<Trip> & { id: string }): Trip {
  return {
    ownerId: 'owner-a',
    title: 'Trip',
    destination: 'Somewhere',
    startDate: '2026-07-01',
    endDate: '2026-07-05',
    travelers: 1,
    coverTheme: 'lisbon',
    estimatedCost: 0,
    currency: 'EUR',
    days: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    nights: 4,
    version: 1,
    ...over,
  };
}

// Fixed "now" so upcoming/past splits are deterministic.
const NOW = new Date(2026, 5, 15); // 2026-06-15

const trips: Trip[] = [
  makeTrip({ id: 'lisbon', title: 'Lisbon Getaway', destination: 'Lisbon, Portugal', startDate: '2026-07-01', endDate: '2026-07-05' }),
  makeTrip({ id: 'kyoto', title: 'Kyoto Autumn', destination: 'Kyoto, Japan', startDate: '2026-10-01', endDate: '2026-10-10' }),
  makeTrip({ id: 'alps', title: 'Alps Hike', destination: 'Chamonix, France', startDate: '2026-02-01', endDate: '2026-02-08' }),
  makeTrip({ id: 'rome', title: 'Rome Weekend', destination: 'Rome, Italy', startDate: '2026-01-10', endDate: '2026-01-12' }),
];

describe('filterTrips', () => {
  it('matches on title (case-insensitive)', () => {
    expect(filterTrips(trips, 'kyoto').map((t) => t.id)).toEqual(['kyoto']);
    expect(filterTrips(trips, 'KYOTO').map((t) => t.id)).toEqual(['kyoto']);
  });

  it('matches on destination', () => {
    expect(filterTrips(trips, 'japan').map((t) => t.id)).toEqual(['kyoto']);
    expect(filterTrips(trips, 'italy').map((t) => t.id)).toEqual(['rome']);
  });

  it('returns all trips for an empty query', () => {
    expect(filterTrips(trips, '   ').length).toBe(4);
  });

  it('returns nothing when there is no match', () => {
    expect(filterTrips(trips, 'antarctica')).toEqual([]);
  });
});

describe('isUpcoming', () => {
  it('treats trips ending today or later as upcoming', () => {
    expect(isUpcoming(makeTrip({ id: 'x', startDate: '2026-06-15', endDate: '2026-06-15' }), NOW)).toBe(true);
    expect(isUpcoming(makeTrip({ id: 'y', startDate: '2026-06-10', endDate: '2026-06-14' }), NOW)).toBe(false);
  });
});

describe('buildTripsView', () => {
  it('splits into upcoming (soonest first) and past (most recent first) by date', () => {
    const view = buildTripsView(trips, { sort: 'date' }, NOW);
    expect(view.upcoming.map((t) => t.id)).toEqual(['lisbon', 'kyoto']);
    expect(view.past.map((t) => t.id)).toEqual(['alps', 'rome']);
  });

  it('sorts each group alphabetically when sorting by name', () => {
    const view = buildTripsView(trips, { sort: 'name' }, NOW);
    expect(view.upcoming.map((t) => t.id)).toEqual(['kyoto', 'lisbon']);
    expect(view.past.map((t) => t.id)).toEqual(['alps', 'rome']);
  });

  it('applies the search filter before grouping', () => {
    const view = buildTripsView(trips, { query: 'a', sort: 'date' }, NOW);
    // "a" matches Kyoto Autumn / Japan, Alps Hike / Chamonix-France, Rome (Italy), Lisbon (Portugal)
    const ids = [...view.upcoming, ...view.past].map((t) => t.id).sort();
    expect(ids).toEqual(['alps', 'kyoto', 'lisbon', 'rome']);

    const narrow = buildTripsView(trips, { query: 'kyoto', sort: 'date' }, NOW);
    expect(narrow.upcoming.map((t) => t.id)).toEqual(['kyoto']);
    expect(narrow.past).toEqual([]);
  });
});
