import { Trip } from '../types';
import {
  NotificationSettings,
  ScheduledPromptNotification,
  notificationIdForItem,
} from './types';

// iOS keeps at most ~64 pending local notifications per app; stay under it and only schedule the
// nearest upcoming nudges.
const DEFAULT_MAX = 60;

/** Parses a "yyyy-MM-dd" date + "HH:mm:ss" time into a local Date, or null if unparseable. */
export function parseLocalDateTime(date: string, time: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!dm || !tm) return null;
  const d = new Date(
    Number(dm[1]),
    Number(dm[2]) - 1,
    Number(dm[3]),
    Number(tm[1]),
    Number(tm[2]),
    Number(tm[3] ?? '0'),
    0,
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Returns true when `hour` falls within the quiet window (handles windows that wrap midnight). */
export function isInQuietHours(hour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return false; // disabled
  return startHour < endHour
    ? hour >= startHour && hour < endHour
    : hour >= startHour || hour < endHour;
}

/** Shifts a fire time out of quiet hours to the next `endHour`, or returns it unchanged. */
export function applyQuietHours(when: Date, startHour: number, endHour: number): Date {
  if (!isInQuietHours(when.getHours(), startHour, endHour)) return when;
  const shifted = new Date(when);
  // Late-night side of a midnight-wrapping window rolls to the next day's end hour.
  if (startHour > endHour && when.getHours() >= startHour) {
    shifted.setDate(shifted.getDate() + 1);
  }
  shifted.setHours(endHour, 0, 0, 0);
  return shifted;
}

/**
 * Computes the post-event reflection nudges to schedule, newest constraints applied: master toggle,
 * event-type filter, end-time + delay, quiet-hours shift, future-only, and an iOS-safe cap. Pure so
 * it can be unit-tested without the notifications native module.
 */
export function computeEventNotifications(
  trips: Trip[],
  settings: NotificationSettings,
  now: Date = new Date(),
  maxCount: number = DEFAULT_MAX,
): ScheduledPromptNotification[] {
  if (!settings.enabled || settings.eventTypes.length === 0) return [];

  const out: ScheduledPromptNotification[] = [];
  for (const trip of trips) {
    // Per-trip opt-out (overrides the global on).
    if (settings.disabledTripIds?.includes(trip.id)) continue;
    for (const day of trip.days ?? []) {
      for (const item of day.items ?? []) {
        if (!settings.eventTypes.includes(item.type)) continue;
        if (!item.endTime) continue;
        const end = parseLocalDateTime(day.date, item.endTime);
        if (!end) continue;

        let fireAt = new Date(end.getTime() + settings.delayMinutes * 60_000);
        fireAt = applyQuietHours(fireAt, settings.quietStartHour, settings.quietEndHour);
        if (fireAt.getTime() <= now.getTime()) continue;

        out.push({
          id: notificationIdForItem(item.id),
          fireAt,
          tripId: trip.id,
          itemId: item.id,
          title: `How was ${item.title}?`,
          body: 'Add a quick note or voice memo while it’s fresh.',
        });
      }
    }
  }

  out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  return out.slice(0, maxCount);
}
