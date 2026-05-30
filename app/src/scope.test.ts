import {
  costRollup,
  conflictIdsForScope,
  scopedDays,
  scopedItems,
  scopeSummary,
} from './scope';
import { Trip, Day, ItineraryItem } from './types';

function item(over: Partial<ItineraryItem> & { id: string }): ItineraryItem {
  return {
    dayId: over.dayId ?? 'd1',
    type: 'Activity',
    title: 'Item',
    currency: 'EUR',
    sortOrder: 0,
    startTime: null,
    endTime: null,
    cost: null,
    ...over,
  };
}

function day(id: string, items: ItineraryItem[]): Day {
  return { id, tripId: 't1', dayNumber: 1, date: '2026-05-14', items };
}

const trip: Trip = {
  id: 't1',
  ownerId: 'owner',
  title: 'Sicily',
  destination: 'Sicily, Italy',
  startDate: '2026-05-14',
  endDate: '2026-05-16',
  travelers: 2,
  coverTheme: 'sicily',
  estimatedCost: 0,
  currency: 'EUR',
  createdAt: '',
  updatedAt: '',
  nights: 2,
  days: [
    day('d1', [
      item({ id: 'a', cost: 25, startTime: '10:00:00', endTime: '11:00:00' }),
      item({ id: 'b', cost: 10, currency: 'USD', startTime: '10:30:00', endTime: '11:30:00' }),
    ]),
    day('d2', [
      item({ id: 'c', cost: 40, startTime: '09:00:00', endTime: '10:00:00' }),
      item({ id: 'd', cost: null, startTime: '12:00:00' }),
    ]),
  ],
};

describe('scopedDays / scopedItems', () => {
  it('returns one day at day scope and all days at trip scope', () => {
    expect(scopedDays(trip, 'day', 'd2').map((d) => d.id)).toEqual(['d2']);
    expect(scopedDays(trip, 'trip').map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(scopedItems(trip, 'trip').length).toBe(4);
    expect(scopedItems(trip, 'day', 'd1').length).toBe(2);
  });

  it('falls back to the first day when dayId is unknown', () => {
    expect(scopedDays(trip, 'day', 'missing').map((d) => d.id)).toEqual(['d1']);
  });
});

describe('costRollup', () => {
  it('sums per currency and ignores null costs', () => {
    const rollup = costRollup(scopedItems(trip, 'trip'));
    expect(rollup.byCurrency).toEqual({ EUR: 65, USD: 10 });
    expect(rollup.total).toBe(75);
  });

  it('scopes cost to a single day', () => {
    const rollup = costRollup(scopedItems(trip, 'day', 'd2'));
    expect(rollup.byCurrency).toEqual({ EUR: 40 });
  });
});

describe('conflictIdsForScope', () => {
  it('flags overlapping items within a day at trip scope', () => {
    const conflicts = conflictIdsForScope(trip, 'trip');
    expect(conflicts.has('a')).toBe(true);
    expect(conflicts.has('b')).toBe(true);
    expect(conflicts.has('c')).toBe(false);
  });

  it('does not flag conflicts on a day with no overlaps', () => {
    expect(conflictIdsForScope(trip, 'day', 'd2').size).toBe(0);
  });
});

describe('scopeSummary', () => {
  it('aggregates day count, stops, cost, and conflicts', () => {
    const trip2 = scopeSummary(trip, 'trip');
    expect(trip2.days).toBe(2);
    expect(trip2.stops).toBe(4);
    expect(trip2.cost.total).toBe(75);
    expect(trip2.conflicts).toBe(2);

    const day1 = scopeSummary(trip, 'day', 'd1');
    expect(day1.days).toBe(1);
    expect(day1.stops).toBe(2);
    expect(day1.conflicts).toBe(2);
  });
});
