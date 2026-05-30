/**
 * Curated IANA time zones for the trip picker. We store the trip's local zone so that
 * itinerary times are unambiguous wall-clock times (what the traveler sees on the ground)
 * and future notifications can be scheduled at the correct absolute instant regardless of
 * the device's own time zone.
 */
export const COMMON_TIME_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Lisbon',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Rome',
  'Europe/Berlin',
  'Europe/Athens',
  'Africa/Cairo',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
] as const;

export type TimeZoneId = (typeof COMMON_TIME_ZONES)[number] | string;

/** Human label, e.g. "Europe/Rome" -> "Rome (Europe)". */
export function timeZoneLabel(tz: string): string {
  const [region, ...rest] = tz.split('/');
  const city = rest.join('/').replace(/_/g, ' ');
  return city ? `${city} (${region})` : tz;
}

/** Best-effort guess of the device's IANA zone; falls back to Europe/Rome. */
export function guessTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome';
  } catch {
    return 'Europe/Rome';
  }
}

/** Options list guaranteed to include the trip's current zone (even if not in the curated set). */
export function timeZoneOptions(current?: string | null): string[] {
  const list = [...COMMON_TIME_ZONES];
  if (current && !list.includes(current as (typeof COMMON_TIME_ZONES)[number])) {
    return [current, ...list];
  }
  return list;
}
