import { Platform, Alert } from 'react-native';
import { Trip, ItineraryItem, Day } from './types';

const CALENDAR_TITLE = 'Wander';

/** Requests calendar write permission. Returns true if granted. */
export async function requestCalendarPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false; // expo-calendar not supported on web

  try {
    const Calendar = await import('expo-calendar');
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/** Finds or creates a "Wander" calendar and returns its id. */
async function getOrCreateCalendar(Calendar: typeof import('expo-calendar')): Promise<string> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existing  = calendars.find((c) => c.title === CALENDAR_TITLE && c.allowsModifications);
  if (existing) return existing.id;

  // Pick the default source (iCloud on iOS, local on Android).
  const defaultCalendar = await (Platform.OS === 'ios'
    ? Calendar.getDefaultCalendarAsync()
    : Promise.resolve(calendars.find((c) => c.source.isLocalAccount) ?? calendars[0]));

  return Calendar.createCalendarAsync({
    title:           CALENDAR_TITLE,
    color:           '#10b981',
    entityType:      Calendar.EntityTypes.EVENT,
    sourceId:        defaultCalendar?.source?.id,
    source:          defaultCalendar?.source as any,
    name:            CALENDAR_TITLE,
    ownerAccount:    'personal',
    accessLevel:     Calendar.CalendarAccessLevel.OWNER,
  });
}

function itemToEvent(
  item: ItineraryItem,
  day: Day,
  Calendar: typeof import('expo-calendar'),
): Record<string, unknown> {
  const [y, m, d] = day.date.split('-').map(Number);

  let startDate: Date;
  let endDate: Date;

  if (item.startTime) {
    const [sh, sm] = item.startTime.split(':').map(Number);
    startDate = new Date(y!, m! - 1, d!, sh, sm);
    if (item.endTime) {
      const [eh, em] = item.endTime.split(':').map(Number);
      endDate = new Date(y!, m! - 1, d!, eh, em);
    } else {
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // default 1 h
    }
  } else {
    // All-day event.
    startDate = new Date(y!, m! - 1, d!);
    endDate   = new Date(y!, m! - 1, d!);
  }

  const notes: string[] = [];
  if (item.type) notes.push(item.type);
  if (item.cost != null) notes.push(`${item.cost} ${item.currency}`);
  if (item.confirmationNo) notes.push(`Ref: ${item.confirmationNo}`);
  if (item.notes) notes.push(item.notes);

  return {
    title:     item.title,
    startDate,
    endDate,
    allDay:    !item.startTime,
    location:  item.locationName ?? undefined,
    notes:     notes.join(' · ') || undefined,
    url:       item.bookingUrl ?? undefined,
    timeZone:  Intl.DateTimeFormat().resolvedOptions().timeZone,
    alarms:    item.startTime ? [{ relativeOffset: -60 }] : [],
    status:       Calendar.EventStatus.CONFIRMED,
    availability: (Calendar as any).Availability?.BUSY ?? 'busy',
  };
}

/** Adds all scheduled itinerary items to the device calendar. Returns count added. */
export async function addTripToCalendar(trip: Trip): Promise<number> {
  if (Platform.OS === 'web') {
    Alert.alert('Not supported', 'Use "Export .ics" to add events to your calendar on web.');
    return 0;
  }

  const granted = await requestCalendarPermission();
  if (!granted) {
    Alert.alert('Permission required', 'Please grant calendar access in Settings to add events.');
    return 0;
  }

  const Calendar   = await import('expo-calendar');
  const calendarId = await getOrCreateCalendar(Calendar);

  let count = 0;
  for (const day of trip.days) {
    for (const item of day.items) {
      if (item.status === 'Wishlist') continue;
      try {
        await Calendar.createEventAsync(calendarId, itemToEvent(item, day, Calendar));
        count++;
      } catch {
        // Skip items that fail (e.g. invalid dates) without aborting the whole batch.
      }
    }
  }
  return count;
}
