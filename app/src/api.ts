import { Platform } from 'react-native';
import { Trip, ItineraryItem, PackingItem, Note, NoteScope, NoteKind } from './types';
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

/** Synchronous auth headers for places that can't await (e.g. native `Image`/`expo-audio` sources). */
export function authHeadersSnapshot(): Record<string, string> {
  const auth = getAuthStateSnapshot();
  if (auth.accessToken) return { Authorization: `Bearer ${auth.accessToken}` };
  if (DEV_USER_ID) return { 'X-Dev-User-Id': DEV_USER_ID };
  return {};
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
  status?: ItineraryItem['status'];
  title: string;
  flightNumber?: string | null;
  locationName?: string | null;
  address?: string | null;
  placeId?: string | null;
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

export interface PlaceCandidate {
  placeId: string;
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  address?: string | null;
  latitude: number;
  longitude: number;
}

export async function searchPlaces(query: string, limit = 5): Promise<PlaceCandidate[]> {
  if (!query.trim()) return [];
  try {
    return await sendJson<PlaceCandidate[]>(
      `/api/places/autocomplete?q=${encodeURIComponent(query.trim())}&limit=${limit}`,
      'GET',
    );
  } catch {
    return [];
  }
}

// ── Travel times ─────────────────────────────────────────────────────────────

export interface TravelSegment {
  fromItemId: string;
  toItemId: string;
  distanceKm: number;
  walkingMinutes: number;
  drivingMinutes: number;
}

export interface TravelTimesResponse {
  segments: TravelSegment[];
}

export async function fetchTravelTimes(tripId: string): Promise<TravelTimesResponse> {
  try {
    return await sendJson<TravelTimesResponse>(`/api/trips/${tripId}/travel-times`, 'GET');
  } catch {
    return { segments: [] };
  }
}

// ── Weather ──────────────────────────────────────────────────────────────────

export interface ItemWeather {
  itemId: string;
  highC: number;
  lowC: number;
  weatherCode: number;
  isClimateSummary: boolean;
}

export interface DayWeather {
  dayId: string;
  highC: number;
  lowC: number;
  weatherCode: number;
  isClimateSummary: boolean;
}

export interface TripWeatherResponse {
  items: ItemWeather[];
  days: DayWeather[];
}

export async function fetchTripWeather(tripId: string): Promise<TripWeatherResponse> {
  try {
    return await sendJson<TripWeatherResponse>(`/api/trips/${tripId}/weather`, 'GET');
  } catch {
    return { items: [], days: [] };
  }
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  try {
    return await sendJson<PlaceDetails>(`/api/places/${encodeURIComponent(placeId)}`, 'GET');
  } catch {
    return null;
  }
}

export async function createItem(tripId: string, dayId: string, input: ItineraryItemInput): Promise<ItineraryItem> {
  return sendJson<ItineraryItem>(`/api/trips/${tripId}/days/${dayId}/items`, 'POST', input);
}

/** Creates an item in the trip backlog (no day). */
export async function createWishlistItem(tripId: string, input: ItineraryItemInput): Promise<ItineraryItem> {
  return sendJson<ItineraryItem>(`/api/trips/${tripId}/items`, 'POST', input);
}

export async function updateItem(tripId: string, itemId: string, input: ItineraryItemInput): Promise<ItineraryItem> {
  return sendJson<ItineraryItem>(`/api/trips/${tripId}/items/${itemId}`, 'PUT', input);
}

export async function deleteItem(tripId: string, itemId: string): Promise<void> {
  await sendJson<void>(`/api/trips/${tripId}/items/${itemId}`, 'DELETE');
}

export async function setItemStatus(tripId: string, itemId: string, status: ItineraryItem['status']): Promise<ItineraryItem> {
  return sendJson<ItineraryItem>(`/api/trips/${tripId}/items/${itemId}/status`, 'PUT', { status });
}

export async function reorderDayItems(tripId: string, dayId: string, itemIds: string[]): Promise<void> {
  await sendJson<void>(`/api/trips/${tripId}/days/${dayId}/items/order`, 'PUT', { itemIds });
}

/** Reorders the trip backlog (unscheduled items). */
export async function reorderBacklog(tripId: string, itemIds: string[]): Promise<void> {
  await sendJson<void>(`/api/trips/${tripId}/items/order`, 'PUT', { itemIds });
}

/** Moves an item onto a day, or to the backlog when targetDayId is null. */
export async function moveItem(tripId: string, itemId: string, targetDayId: string | null): Promise<ItineraryItem> {
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

// ── Notes & journaling (Phase 4) ─────────────────────────────────────────────

export interface CreateNoteInput {
  scope: NoteScope;
  targetId?: string | null;
  kind?: NoteKind;
  bodyText?: string | null;
  promptId?: string | null;
  promptText?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Notes for a trip (newest first). Falls back to an empty list when the API is unreachable. */
export async function getTripNotes(tripId: string): Promise<{ data: Note[]; live: boolean }> {
  return tryFetch<Note[]>(`/api/trips/${tripId}/notes`, []);
}

export async function createNote(tripId: string, input: CreateNoteInput): Promise<Note> {
  return sendJson<Note>(`/api/trips/${tripId}/notes`, 'POST', {
    scope: input.scope,
    targetId: input.targetId ?? null,
    kind: input.kind ?? 'Text',
    bodyText: input.bodyText ?? null,
    // The API column is a GUID, so only forward real UUIDs (preset prompts). Custom prompt ids
    // aren't UUIDs — their text still persists via promptText below.
    promptId: input.promptId && UUID_RE.test(input.promptId) ? input.promptId : null,
    promptText: input.promptText ?? null,
  });
}

export async function deleteNote(noteId: string): Promise<void> {
  await sendJson<void>(`/api/notes/${noteId}`, 'DELETE');
}

export interface CreateVoiceNoteFields {
  scope: NoteScope;
  targetId?: string | null;
  bodyText?: string | null;
  durationSeconds?: number | null;
  locale?: string | null;
}

export interface CreatePhotoNoteFields {
  scope: NoteScope;
  targetId?: string | null;
  bodyText?: string | null;
}

/**
 * A file to upload. On web this is a `Blob`/`File`; on native it's the
 * `{ uri, name, type }` shape React Native's `FormData` understands.
 */
export type UploadFile = Blob | { uri: string; name: string; type: string };

function appendFile(form: FormData, field: string, file: UploadFile, fileName: string) {
  if ((file as any)?.uri) {
    // Native: the filename/type travel inside the object.
    form.append(field, file as any);
  } else {
    form.append(field, file as any, fileName);
  }
}

async function postMultipart(path: string, form: FormData): Promise<Note> {
  // Don't set Content-Type — the platform adds the multipart boundary automatically.
  const headers = (await buildHeaders()) ?? {};
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: form as any });
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  return (await res.json()) as Note;
}

/** Uploads a recorded audio clip as a voice note (multipart). The API stores the audio and queues
 *  it for transcription; the transcript arrives asynchronously (visible after a refetch). */
export async function createVoiceNote(
  tripId: string,
  fields: CreateVoiceNoteFields,
  audio: UploadFile,
  fileName: string,
): Promise<Note> {
  const form = new FormData();
  form.append('Scope', fields.scope);
  if (fields.targetId) form.append('TargetId', fields.targetId);
  if (fields.bodyText) form.append('BodyText', fields.bodyText);
  if (fields.durationSeconds != null) form.append('DurationSeconds', String(Math.round(fields.durationSeconds)));
  if (fields.locale) form.append('Locale', fields.locale);
  appendFile(form, 'Audio', audio, fileName);
  return postMultipart(`/api/trips/${tripId}/notes/voice`, form);
}

/** Uploads a photo as a photo note (multipart). No transcription is queued for images. */
export async function createPhotoNote(
  tripId: string,
  fields: CreatePhotoNoteFields,
  image: UploadFile,
  fileName: string,
): Promise<Note> {
  const form = new FormData();
  form.append('Scope', fields.scope);
  if (fields.targetId) form.append('TargetId', fields.targetId);
  if (fields.bodyText) form.append('BodyText', fields.bodyText);
  appendFile(form, 'Image', image, fileName);
  return postMultipart(`/api/trips/${tripId}/notes/photo`, form);
}

/** Absolute URL for a media asset (used directly by native `Image`/`expo-audio` with auth headers). */
export function mediaUrl(tripId: string, mediaAssetId: string): string {
  return `${API_BASE}/api/trips/${tripId}/notes/media/${mediaAssetId}`;
}

/** Fetches media bytes with auth and returns a playable/displayable object URL (web only). */
export async function fetchMediaObjectUrl(tripId: string, mediaAssetId: string): Promise<string> {
  const headers = await buildHeaders();
  const res = await fetch(mediaUrl(tripId, mediaAssetId), { headers });
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  const blob = await res.blob();
  return (URL as any).createObjectURL(blob) as string;
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
