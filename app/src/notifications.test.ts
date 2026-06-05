import { Trip, ItineraryItem, Day } from './types';
import {
  parseLocalDateTime,
  isInQuietHours,
  applyQuietHours,
  computeEventNotifications,
} from './notifications/schedule';
import { DEFAULT_NOTIFICATION_SETTINGS, NotificationSettings } from './notifications/types';

function item(partial: Partial<ItineraryItem> & { id: string }): ItineraryItem {
  return {
    tripId: 't1',
    dayId: 'd1',
    type: 'Activity',
    status: 'Confirmed',
    title: 'Event',
    currency: 'EUR',
    sortOrder: 0,
    ...partial,
  } as ItineraryItem;
}

function trip(date: string, items: ItineraryItem[]): Trip {
  const day: Day = { id: 'd1', tripId: 't1', dayNumber: 1, date, items };
  return { id: 't1', days: [day] } as unknown as Trip;
}

const enabled = (over: Partial<NotificationSettings> = {}): NotificationSettings => ({
  ...DEFAULT_NOTIFICATION_SETTINGS,
  enabled: true,
  ...over,
});

describe('parseLocalDateTime', () => {
  it('parses date + time into a local Date', () => {
    const d = parseLocalDateTime('2030-06-01', '14:30:00');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2030);
    expect(d!.getMonth()).toBe(5);
    expect(d!.getDate()).toBe(1);
    expect(d!.getHours()).toBe(14);
    expect(d!.getMinutes()).toBe(30);
  });

  it('returns null on malformed input', () => {
    expect(parseLocalDateTime('nope', '14:30:00')).toBeNull();
    expect(parseLocalDateTime('2030-06-01', 'nope')).toBeNull();
  });
});

describe('quiet hours', () => {
  it('detects a midnight-wrapping window (22–8)', () => {
    expect(isInQuietHours(23, 22, 8)).toBe(true);
    expect(isInQuietHours(3, 22, 8)).toBe(true);
    expect(isInQuietHours(14, 22, 8)).toBe(false);
  });

  it('treats start === end as disabled', () => {
    expect(isInQuietHours(2, 0, 0)).toBe(false);
  });

  it('shifts a late-night time to the next morning end hour', () => {
    const shifted = applyQuietHours(new Date(2030, 5, 1, 23, 30), 22, 8);
    expect(shifted.getDate()).toBe(2);
    expect(shifted.getHours()).toBe(8);
    expect(shifted.getMinutes()).toBe(0);
  });

  it('shifts an early-morning time to the same day end hour', () => {
    const shifted = applyQuietHours(new Date(2030, 5, 1, 3, 0), 22, 8);
    expect(shifted.getDate()).toBe(1);
    expect(shifted.getHours()).toBe(8);
  });

  it('leaves a daytime time unchanged', () => {
    const when = new Date(2030, 5, 1, 14, 15);
    expect(applyQuietHours(when, 22, 8).getTime()).toBe(when.getTime());
  });
});

describe('computeEventNotifications', () => {
  const now = new Date(2030, 5, 1, 6, 0); // 2030-06-01 06:00 local

  it('returns nothing when disabled', () => {
    const t = trip('2030-06-01', [item({ id: 'a', endTime: '14:00:00' })]);
    expect(computeEventNotifications([t], enabled({ enabled: false }), now)).toEqual([]);
  });

  it('schedules end-time + delay for matching event types', () => {
    const t = trip('2030-06-01', [item({ id: 'a', type: 'Food', title: 'Lunch', endTime: '14:00:00' })]);
    const out = computeEventNotifications([t], enabled({ delayMinutes: 15 }), now);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('wander-prompt-a');
    expect(out[0].itemId).toBe('a');
    expect(out[0].title).toContain('Lunch');
    expect(out[0].fireAt.getHours()).toBe(14);
    expect(out[0].fireAt.getMinutes()).toBe(15);
  });

  it('skips event types not in the filter', () => {
    const t = trip('2030-06-01', [
      item({ id: 'a', type: 'Lodging', endTime: '14:00:00' }),
      item({ id: 'b', type: 'Flight', endTime: '15:00:00' }),
    ]);
    expect(computeEventNotifications([t], enabled(), now)).toEqual([]);
  });

  it('skips events without an end time', () => {
    const t = trip('2030-06-01', [item({ id: 'a', type: 'Activity', endTime: null })]);
    expect(computeEventNotifications([t], enabled(), now)).toEqual([]);
  });

  it('excludes nudges whose fire time is already past', () => {
    // 04:15 < now 06:00; disable quiet hours so it isn't shifted forward into the future.
    const t = trip('2030-06-01', [item({ id: 'a', endTime: '04:00:00' })]);
    expect(
      computeEventNotifications([t], enabled({ delayMinutes: 15, quietStartHour: 0, quietEndHour: 0 }), now),
    ).toEqual([]);
  });

  it('applies quiet hours to the fire time', () => {
    const t = trip('2030-06-01', [item({ id: 'a', endTime: '23:00:00' })]); // 23:30 -> next 08:00
    const out = computeEventNotifications([t], enabled({ delayMinutes: 30 }), now);
    expect(out).toHaveLength(1);
    expect(out[0].fireAt.getDate()).toBe(2);
    expect(out[0].fireAt.getHours()).toBe(8);
  });

  it('sorts by fire time and caps to maxCount', () => {
    const t = trip('2030-06-01', [
      item({ id: 'a', endTime: '18:00:00' }),
      item({ id: 'b', endTime: '12:00:00' }),
      item({ id: 'c', endTime: '15:00:00' }),
    ]);
    const out = computeEventNotifications([t], enabled({ delayMinutes: 0 }), now, 2);
    expect(out.map((n) => n.itemId)).toEqual(['b', 'c']);
  });
});
