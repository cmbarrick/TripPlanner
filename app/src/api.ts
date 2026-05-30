import { Platform } from 'react-native';
import { Trip, ItineraryItem, PackingItem } from './types';
import { mockTrips } from './mockData';
import { getAuthStateSnapshot } from './auth/session';

// On web/desktop the API is reachable at localhost. Android emulator maps the
// host machine to 10.0.2.2. Override via EXPO_PUBLIC_API_URL when needed.
const DEFAULT_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ?? `http://${DEFAULT_HOST}:5064`;
const DEV_USER_ID = process.env.EXPO_PUBLIC_DEV_USER_ID;

async function buildHeaders(): Promise<HeadersInit | undefined> {
  const auth = getAuthStateSnapshot();
  if (auth.accessToken) {
    return { Authorization: `Bearer ${auth.accessToken}` };
  }

  if (DEV_USER_ID) {
    return { 'X-Dev-User-Id': DEV_USER_ID };
  }

  return undefined;
}

async function tryFetch<T>(path: string, fallback: T): Promise<{ data: T; live: boolean }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const headers = await buildHeaders();
    const res = await fetch(`${API_BASE}${path}`, {
      signal: controller.signal,
      headers,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { data: (await res.json()) as T, live: true };
  } catch {
    // API not running — fall back to local mock data so the app still works.
    return { data: fallback, live: false };
  }
}

export async function getTrips(): Promise<{ data: Trip[]; live: boolean }> {
  return tryFetch<Trip[]>('/api/trips', mockTrips);
}

export async function getTrip(id: string): Promise<{ data: Trip | undefined; live: boolean }> {
  const fallback = mockTrips.find((t) => t.id === id);
  return tryFetch<Trip | undefined>(`/api/trips/${id}`, fallback);
}

/** Writable fields the client sends when creating or editing a trip. */
export interface TripInput {
  title: string;
  destination: string;
  startDate: string; // "yyyy-MM-dd"
  endDate: string; // "yyyy-MM-dd"
  travelers: number;
  coverTheme: string;
  estimatedCost: number;
  currency: string;
  timeZoneId?: string | null;
}

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function sendJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  const baseHeaders = (await buildHeaders()) ?? {};
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { ...baseHeaders, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ApiError(await readError(res), res.status);
  }
  // 204 No Content (delete) has no JSON body.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function readError(res: Response): Promise<string> {
  try {
    const problem = await res.json();
    if (problem?.errors) {
      const first = Object.values(problem.errors as Record<string, string[]>)[0];
      if (first?.length) return first[0];
    }
    if (problem?.title) return problem.title as string;
  } catch {
    // fall through to status text
  }
  return `Request failed (HTTP ${res.status})`;
}

export async function createTrip(input: TripInput): Promise<Trip> {
  return sendJson<Trip>('/api/trips', 'POST', {
    ...input,
    days: buildDays(input.startDate, input.endDate),
  });
}

export async function updateTrip(id: string, input: TripInput): Promise<Trip> {
  return sendJson<Trip>(`/api/trips/${id}`, 'PUT', input);
}

export async function deleteTrip(id: string): Promise<void> {
  await sendJson<void>(`/api/trips/${id}`, 'DELETE');
}

/** Writable fields the client sends when creating or editing an itinerary item. */
export interface ItineraryItemInput {
  type: ItineraryItem['type'];
  title: string;
  locationName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  cost?: number | null;
  currency: string;
  confirmationNo?: string | null;
  bookingUrl?: string | null;
  notes?: string | null;
}

export async function createItem(tripId: string, dayId: string, input: ItineraryItemInput): Promise<ItineraryItem> {
  return sendJson<ItineraryItem>(`/api/trips/${tripId}/days/${dayId}/items`, 'POST', input);
}

export async function updateItem(tripId: string, itemId: string, input: ItineraryItemInput): Promise<ItineraryItem> {
  return sendJson<ItineraryItem>(`/api/trips/${tripId}/items/${itemId}`, 'PUT', input);
}

export async function deleteItem(tripId: string, itemId: string): Promise<void> {
  await sendJson<void>(`/api/trips/${tripId}/items/${itemId}`, 'DELETE');
}

export async function reorderDayItems(tripId: string, dayId: string, itemIds: string[]): Promise<void> {
  await sendJson<void>(`/api/trips/${tripId}/days/${dayId}/items/order`, 'PUT', { itemIds });
}

export async function moveItem(tripId: string, itemId: string, targetDayId: string): Promise<ItineraryItem> {
  return sendJson<ItineraryItem>(`/api/trips/${tripId}/items/${itemId}/move`, 'PUT', { targetDayId });
}

export async function getPackingItems(tripId: string): Promise<PackingItem[]> {
  return sendJson<PackingItem[]>(`/api/trips/${tripId}/packing`, 'GET');
}

export async function addPackingItem(tripId: string, name: string): Promise<PackingItem> {
  return sendJson<PackingItem>(`/api/trips/${tripId}/packing`, 'POST', { name });
}

export async function setPackingItemPacked(tripId: string, packingItemId: string, isPacked: boolean): Promise<PackingItem> {
  return sendJson<PackingItem>(`/api/trips/${tripId}/packing/${packingItemId}`, 'PUT', { isPacked });
}

export async function deletePackingItem(tripId: string, packingItemId: string): Promise<void> {
  await sendJson<void>(`/api/trips/${tripId}/packing/${packingItemId}`, 'DELETE');
}

/** Generates one day per date in the (inclusive) range so a new trip is immediately plannable. */
function buildDays(startDate: string, endDate: string) {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const start = new Date(sy, (sm ?? 1) - 1, sd ?? 1);
  const end = new Date(ey, (em ?? 1) - 1, ed ?? 1);
  const days: { dayNumber: number; date: string }[] = [];
  let n = 1;
  for (let d = new Date(start); d <= end && n <= 60; d.setDate(d.getDate() + 1), n++) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({ dayNumber: n, date: iso });
  }
  return days;
}
