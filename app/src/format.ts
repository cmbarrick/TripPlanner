const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CURRENCY: Record<string, string> = { EUR: '€', USD: '$', CHF: 'CHF ', GBP: '£', JPY: '¥' };

export function parseDate(d: string): Date {
  // "yyyy-MM-dd" -> local Date
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1);
}

export function dateRange(start: string, end: string): string {
  const a = parseDate(start);
  const b = parseDate(end);
  const sameMonth = a.getMonth() === b.getMonth();
  return sameMonth
    ? `${MONTHS[a.getMonth()]} ${a.getDate()}–${b.getDate()}`
    : `${MONTHS[a.getMonth()]} ${a.getDate()} – ${MONTHS[b.getMonth()]} ${b.getDate()}`;
}

export function dayLabel(date: string, num: number): { d: string; w: string } {
  const dt = parseDate(date);
  return { d: `Day ${num} · ${DOW[dt.getDay()]}`, w: `${MONTHS[dt.getMonth()]} ${dt.getDate()}` };
}

export function fmtTime(t?: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':');
  return `${h}:${m}`;
}

/** "2026-05-13" -> "Wed, May 13, 2026" (empty string when missing). */
export function formatDateLong(iso?: string | null): string {
  if (!iso) return '';
  const d = parseDate(iso);
  return `${DOW[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Formats a "HH:mm[:ss]" time respecting the user's 12h/24h preference. */
export function formatClock(t?: string | null, clock: '12h' | '24h' = '12h'): string {
  if (!t) return '';
  return clock === '24h' ? fmtTime(t) : formatTime12h(t);
}

/** "14:05[:00]" -> "2:05 PM" (empty string when missing). */
export function formatTime12h(t?: string | null): string {
  if (!t) return '';
  const [hRaw, mRaw] = t.split(':');
  const h = Number(hRaw);
  const m = mRaw ?? '00';
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.padStart(2, '0')} ${period}`;
}

/** Builds a "yyyy-MM-dd" string from numeric parts (local, no tz shift). */
export function toIsoDate(year: number, month1: number, day: number): string {
  return `${year}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function fmtMoney(amount?: number | null, currency = 'EUR'): string {
  if (amount == null) return '';
  const sym = CURRENCY[currency] ?? `${currency} `;
  return `${sym}${amount}`;
}

export function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

/** Formats a Celsius value for display. Defaults to Fahrenheit. */
export function formatTemp(c?: number | null, unit: 'F' | 'C' = 'F'): string {
  if (c == null) return '';
  return unit === 'F' ? `${cToF(c)}°F` : `${c}°C`;
}

export function weatherEmoji(icon?: string | null): string {
  switch (icon) {
    case 'sun': return '☀️';
    case 'cloud-sun': return '⛅';
    case 'cloud': return '☁️';
    case 'rain': return '🌧️';
    case 'snow': return '❄️';
    default: return '🌡️';
  }
}

export function countdown(start: string): string {
  const days = Math.ceil((parseDate(start).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'Past';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 31) return `In ${days} days`;
  return `In ${Math.round(days / 30)} months`;
}
