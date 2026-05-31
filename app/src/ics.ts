import { Platform, Linking } from 'react-native';
import { Trip, Day, ItineraryItem } from './types';

// ── .ics generation ───────────────────────────────────────────────────────────

function icsDate(date: string, time?: string | null): string {
  // date = "yyyy-MM-dd", time = "HH:mm:ss" or null
  const d = date.replace(/-/g, '');
  if (!time) return d; // all-day
  const t = time.replace(/:/g, '').slice(0, 6);
  return `${d}T${t}`;
}

function icsDateEnd(date: string, time?: string | null): string {
  if (!time) {
    // All-day event — DTEND is the next day per RFC 5545.
    const [y, m, d] = date.split('-').map(Number);
    const next = new Date(y!, m! - 1, d! + 1);
    return `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}${String(next.getDate()).padStart(2, '0')}`;
  }
  return icsDate(date, time);
}

function escape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function fold(line: string): string {
  // RFC 5545 §3.1: fold lines longer than 75 octets.
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let i = 0;
  parts.push(line.slice(0, 75));
  i = 75;
  while (i < line.length) {
    parts.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return parts.join('\r\n');
}

function vevent(item: ItineraryItem, day: Day): string {
  const dateVal = day.date;
  const hasTime = !!item.startTime;
  const dtstart = hasTime
    ? `DTSTART:${icsDate(dateVal, item.startTime)}`
    : `DTSTART;VALUE=DATE:${icsDate(dateVal)}`;
  const dtend = hasTime
    ? `DTEND:${icsDateEnd(dateVal, item.endTime ?? item.startTime)}`
    : `DTEND;VALUE=DATE:${icsDateEnd(dateVal)}`;

  const parts = [
    'BEGIN:VEVENT',
    `UID:${item.id}@wander.app`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    fold(dtstart),
    fold(dtend),
    fold(`SUMMARY:${escape(item.title)}`),
  ];

  if (item.locationName) parts.push(fold(`LOCATION:${escape(item.locationName)}`));

  const desc: string[] = [];
  if (item.type) desc.push(item.type);
  if (item.cost != null) desc.push(`${item.cost} ${item.currency}`);
  if (item.confirmationNo) desc.push(`Ref: ${item.confirmationNo}`);
  if (item.notes) desc.push(item.notes);
  if (desc.length) parts.push(fold(`DESCRIPTION:${escape(desc.join(' · '))}`));

  if (item.latitude != null && item.longitude != null)
    parts.push(`GEO:${item.latitude};${item.longitude}`);

  parts.push('END:VEVENT');
  return parts.join('\r\n');
}

export function generateIcs(trip: Trip): string {
  const events: string[] = [];
  for (const day of trip.days) {
    for (const item of day.items) {
      events.push(vevent(item, day));
    }
  }

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wander//Wander Trip Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${escape(trip.title)}`),
    fold(`X-WR-CALDESC:${escape(trip.destination)}`),
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

// ── Export / share ────────────────────────────────────────────────────────────

export async function exportIcs(trip: Trip): Promise<void> {
  const content = generateIcs(trip);
  const filename = `${trip.title.replace(/[^a-z0-9]/gi, '_')}.ics`;

  if (Platform.OS === 'web') {
    // Browser download via a temporary <a> element.
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  // Native: write to the cache directory and share.
  // Dynamic imports so the web bundle never includes expo-file-system / expo-sharing.
  try {
    const FileSystem = await import('expo-file-system');
    const Sharing    = await import('expo-sharing');
    const cacheDir   = (FileSystem as any).cacheDirectory ?? (FileSystem as any).Paths?.cache ?? '';
    const path       = `${cacheDir}${filename}`;
    await (FileSystem as any).writeAsStringAsync(path, content, { encoding: 'utf8' });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, { mimeType: 'text/calendar', UTI: 'public.calendar' });
    } else {
      await Linking.openURL(`file://${path}`);
    }
  } catch (e) {
    console.warn('ICS export failed:', e);
    throw e;
  }
}
