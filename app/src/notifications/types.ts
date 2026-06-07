import { ItineraryItemType } from '../types';

/** On-device config for post-event reflection nudges. Stored locally (offline-first); these are
 *  local scheduled notifications, not server push. */
export interface NotificationSettings {
  /** Master on/off for post-event nudges. */
  enabled: boolean;
  /** Minutes after an event's end time to fire the nudge. */
  delayMinutes: number;
  /** Which itinerary item types get a nudge (default: meals & activities; skip transport/lodging). */
  eventTypes: ItineraryItemType[];
  /** Quiet hours window (24h local). A nudge that would fire inside it is shifted to `quietEndHour`.
   *  Set start === end to disable quiet hours. */
  quietStartHour: number;
  quietEndHour: number;
  /** Trips where nudges are explicitly turned off (overrides the global on). */
  disabledTripIds: string[];
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false, // opt-in: off until the user enables it (and grants OS permission)
  delayMinutes: 15,
  eventTypes: ['Food', 'Activity'],
  quietStartHour: 22,
  quietEndHour: 8,
  disabledTripIds: [],
};

/** A computed, ready-to-schedule local notification for an itinerary event. */
export interface ScheduledPromptNotification {
  /** Stable id derived from the item so re-syncs replace rather than duplicate. */
  id: string;
  /** When it should fire (device local time). */
  fireAt: Date;
  tripId: string;
  itemId: string;
  title: string;
  body: string;
}

/** Stable notification id for an itinerary item (one pending nudge per event). */
export function notificationIdForItem(itemId: string): string {
  return `wander-prompt-${itemId}`;
}
