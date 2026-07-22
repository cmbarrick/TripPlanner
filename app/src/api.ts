import { Platform } from 'react-native';
import {
  Trip,
  ItineraryItem,
  PackingItem,
  Note,
  NoteScope,
  NoteKind,
  TripRole,
  TripShareLink,
  TripMember,
  Reaction,
  ReactionTargetType,
} from './types';
import { mockTrips } from './mockData';
import { getAuthStateSnapshot, ensureFreshToken } from './auth/session';

// On web/desktop the API is reachable at localhost. Android emulator maps the
// host machine to 10.0.2.2. Override via EXPO_PUBLIC_API_URL when needed.
const DEFAULT_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ?? `http://${DEFAULT_HOST}:5064`;
const DEV_USER_ID = process.env.EXPO_PUBLIC_DEV_USER_ID;

async function buildHeaders(): Promise<HeadersInit | undefined> {
  // Silently refreshes first if the current token is expired/near-expiry — without this, a
  // session degrades to the demo-data fallback after ~an hour with no way to recover short of
  // manually signing out and back in (confirmed live, not hypothetical).
  const token = await ensureFreshToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
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
  /** Optimistic concurrency token — pass the trip's current `version` when editing. Omitted (or 0)
   *  on create, where it's meaningless. */
  version?: number;
}

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * True when a thrown error looks like a connectivity failure (the request never got a response)
 * rather than a server rejection. A failed `fetch` rejects with a TypeError and no HTTP status;
 * `sendJson` only throws an {@link ApiError} (with a status) once the server has responded. The
 * offline outbox uses this to decide whether a write should be queued for later replay.
 */
export function isOfflineError(e: unknown): boolean {
  if (e instanceof ApiError) return e.status === undefined;
  return true;
}

/** True for a 409 — the server rejected the write because its concurrency token (`version`) was
 *  stale: someone else changed this record since the caller last read it (Phase 9). The caller
 *  should refetch and let the user decide whether to reapply their edit, rather than retrying the
 *  same request (which would just 409 again) or silently discarding it. */
export function isConflictError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 409;
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
  /** Optimistic concurrency token — pass the item's current `version` when editing. Omitted (or 0)
   *  on create, where it's meaningless. */
  version?: number;
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

/** Optional hints for place search: a session token (groups suggest+retrieve into one billed
 *  Search Box session) and a proximity point to bias results toward the trip area. */
export interface PlaceSearchHints {
  sessionToken?: string;
  proximityLat?: number | null;
  proximityLng?: number | null;
}

export async function searchPlaces(
  query: string,
  limit = 5,
  hints?: PlaceSearchHints,
): Promise<PlaceCandidate[]> {
  if (!query.trim()) return [];
  const params = new URLSearchParams({ q: query.trim(), limit: String(limit) });
  if (hints?.sessionToken) params.set('session', hints.sessionToken);
  if (hints?.proximityLat != null && hints?.proximityLng != null) {
    params.set('proximityLat', String(hints.proximityLat));
    params.set('proximityLng', String(hints.proximityLng));
  }
  try {
    return await sendJson<PlaceCandidate[]>(`/api/places/autocomplete?${params.toString()}`, 'GET');
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

export interface HourlyWeatherPoint {
  /** Local ISO time, e.g. "2026-07-01T14:00". */
  time: string;
  tempC: number;
  weatherCode: number;
  /** Chance of precipitation 0–100, or null when unavailable (historical archive). */
  precipitationProbability: number | null;
}

export interface ItemHourlyWeather {
  isClimateSummary: boolean;
  hours: HourlyWeatherPoint[];
}

export async function fetchItemHourlyWeather(
  tripId: string,
  itemId: string,
): Promise<ItemHourlyWeather> {
  try {
    return await sendJson<ItemHourlyWeather>(
      `/api/trips/${tripId}/weather/hourly/${itemId}`,
      'GET',
    );
  } catch {
    return { isClimateSummary: false, hours: [] };
  }
}

export async function getPlaceDetails(
  placeId: string,
  sessionToken?: string,
): Promise<PlaceDetails | null> {
  const qs = sessionToken ? `?session=${encodeURIComponent(sessionToken)}` : '';
  try {
    return await sendJson<PlaceDetails>(`/api/places/${encodeURIComponent(placeId)}${qs}`, 'GET');
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

// ── AI assistant (Phase 5) ───────────────────────────────────────────────────

export interface AiStatus {
  enabled: boolean;
  dailyTokenLimit: number;
  tokensUsedToday: number;
  tokensRemainingToday: number;
}

const DEFAULT_AI_STATUS: AiStatus = {
  enabled: false,
  dailyTokenLimit: 50_000,
  tokensUsedToday: 0,
  tokensRemainingToday: 50_000,
};

/** Whether AI planning is configured on the server and the caller's daily quota headroom. */
export async function fetchAiStatus(): Promise<AiStatus> {
  try {
    return await sendJson<AiStatus>('/api/ai/status', 'GET');
  } catch {
    return DEFAULT_AI_STATUS;
  }
}

export interface DraftItineraryItem {
  dayNumber: number;
  type: ItineraryItem['type'];
  title: string;
  startTime?: string | null;
  endTime?: string | null;
  locationName?: string | null;
  address?: string | null;
  cost?: number | null;
  notes?: string | null;
}

export interface GenerateItineraryResponse {
  summary: string;
  items: DraftItineraryItem[];
  tokensUsed: number;
}

/** Ephemeral AI draft — not persisted until the client accepts via existing item CRUD. */
export async function generateItineraryDraft(
  tripId: string,
  prompt: string,
): Promise<GenerateItineraryResponse> {
  return sendJson<GenerateItineraryResponse>(
    `/api/ai/trips/${tripId}/generate-itinerary`,
    'POST',
    { prompt },
  );
}

/** Maps a draft row to the payload expected by create-item endpoints. */
export function draftItemToInput(
  item: DraftItineraryItem,
  currency: string,
): ItineraryItemInput {
  return {
    type: item.type,
    status: 'Tentative',
    title: item.title,
    startTime: item.startTime ?? null,
    endTime: item.endTime ?? null,
    locationName: item.locationName ?? null,
    address: item.address ?? null,
    cost: item.cost ?? null,
    currency,
    notes: item.notes ?? null,
  };
}

export interface AiChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiTripChange {
  action: string;
  itemId: string | null;
  title: string;
  dayNumber: number | null;
  detail?: string | null;
  batchId?: string | null;
}

export interface ItineraryItemRestore {
  dayId: string | null;
  type: string;
  status: string;
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
  notes?: string | null;
}

export interface AiUndoStep {
  kind: string;
  itemId?: string | null;
  targetDayId?: string | null;
  restore?: ItineraryItemRestore | null;
}

export interface AiChatStreamEvent {
  type: 'text_delta' | 'tool_start' | 'tool_result' | 'trip_changed' | 'done' | 'error';
  text?: string;
  toolName?: string;
  toolSummary?: string;
  changes?: AiTripChange[];
  tokensUsed?: number;
  message?: string;
  batchId?: string | null;
  undoSteps?: AiUndoStep[] | null;
}

/** SSE chat with tool-calling — streams events until done or error. */
export async function streamAiChat(
  tripId: string,
  message: string,
  history: AiChatHistoryMessage[],
  onEvent: (event: AiChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const headers = (await buildHeaders()) ?? {};
  const res = await fetch(`${API_BASE}/api/ai/trips/${tripId}/chat`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ message, history }),
    signal,
  });

  if (!res.ok) {
    throw new ApiError(await readError(res), res.status);
  }

  const { readSseStream, parseSseEvents } = await import('./ai/chatStream');

  if (res.body) {
    await readSseStream(res.body, onEvent);
    return;
  }

  parseSseEvents(await res.text(), onEvent);
}

/** Reverse a batch of AI itinerary mutations (steps applied in reverse order on the server). */
export async function undoAiBatch(
  tripId: string,
  steps: AiUndoStep[],
): Promise<AiTripChange[]> {
  const res = await sendJson<{ changes: AiTripChange[] }>(
    `/api/ai/trips/${tripId}/undo`,
    'POST',
    { steps },
  );
  return res.changes;
}

// ── User preferences (Phase 5 Slice 1) ─────────────────────────────────────

export type TravelStyle = 'adventure' | 'culture' | 'foodie' | 'relaxation' | 'mixed';
export type TravelPace = 'relaxed' | 'moderate' | 'packed';
export type TravelDiet = 'none' | 'vegetarian' | 'vegan' | 'gluten_free' | 'halal' | 'kosher';
export type BudgetBand = 'budget' | 'mid' | 'luxury';

export interface UserPreferences {
  temperatureUnit: 'F' | 'C';
  distanceUnit: 'mi' | 'km';
  currency: string;
  travelStyle: TravelStyle | null;
  pace: TravelPace | null;
  diet: TravelDiet | null;
  budgetBand: BudgetBand | null;
}

export type UserPreferencesPatch = Partial<UserPreferences>;

const DEFAULT_PREFERENCES: UserPreferences = {
  temperatureUnit: 'F',
  distanceUnit: 'mi',
  currency: 'USD',
  travelStyle: null,
  pace: null,
  diet: null,
  budgetBand: null,
};

/** Server-backed profile preferences; falls back to defaults when the API is unreachable. */
export async function fetchPreferences(): Promise<{ data: UserPreferences; live: boolean }> {
  return tryFetch<UserPreferences>('/api/preferences', DEFAULT_PREFERENCES);
}

export async function updatePreferences(patch: UserPreferencesPatch): Promise<UserPreferences> {
  return sendJson<UserPreferences>('/api/preferences', 'PUT', patch);
}

// ── AI recap & export (Phase 6) ──────────────────────────────────────────────

export type RecapScope = 'Trip' | 'Day' | 'Event';
export type RecapTone = 'Narrative' | 'Highlights' | 'Bullets';
export type RecapStatus = 'Draft' | 'Final';

/** One generated section with the journal notes that grounded it. */
export interface RecapSection {
  heading: string;
  body: string;
  noteIds: string[];
}

export interface Recap {
  id: string;
  tripId: string;
  scope: RecapScope;
  targetId: string | null;
  tone: RecapTone;
  title: string;
  body: string;
  sections: RecapSection[];
  generatedFromNoteIds: string[];
  status: RecapStatus;
  version: number;
  /** Relative URL of the unlisted share page once shared. */
  shareUrl: string | null;
  exportUrls: string[];
  tokensUsed: number;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateRecapInput {
  scope: RecapScope;
  targetId?: string | null;
  tone: RecapTone;
}

/** Recaps for a trip (newest first). Falls back to an empty list when the API is unreachable. */
export async function fetchRecaps(tripId: string): Promise<{ data: Recap[]; live: boolean }> {
  return tryFetch<Recap[]>(`/api/trips/${tripId}/recaps`, []);
}

export async function generateRecap(tripId: string, input: GenerateRecapInput): Promise<Recap> {
  return sendJson<Recap>(`/api/trips/${tripId}/recaps/generate`, 'POST', input);
}

export async function updateRecap(
  tripId: string,
  recapId: string,
  input: { title: string; body: string },
): Promise<Recap> {
  return sendJson<Recap>(`/api/trips/${tripId}/recaps/${recapId}`, 'PUT', input);
}

export async function finalizeRecap(tripId: string, recapId: string): Promise<Recap> {
  return sendJson<Recap>(`/api/trips/${tripId}/recaps/${recapId}/finalize`, 'POST');
}

/** Issues (or reuses) the unlisted share-page link for a recap. */
export async function shareRecap(tripId: string, recapId: string): Promise<Recap> {
  return sendJson<Recap>(`/api/trips/${tripId}/recaps/${recapId}/share`, 'POST');
}

export async function deleteRecap(tripId: string, recapId: string): Promise<void> {
  await sendJson<void>(`/api/trips/${tripId}/recaps/${recapId}`, 'DELETE');
}

/** Absolute URL for a recap's share page (the API serves the page). */
export function recapShareAbsoluteUrl(shareUrl: string): string {
  return `${API_BASE}${shareUrl}`;
}

/** Downloads the server-rendered recap PDF (browser download on web, share sheet on native). */
export async function downloadRecapPdf(
  tripId: string,
  recapId: string,
  options?: { includePhotos?: boolean; fileName?: string },
): Promise<void> {
  const headers = (await buildHeaders()) ?? {};
  const params = options?.includePhotos ? '?includePhotos=true' : '';
  const res = await fetch(`${API_BASE}/api/trips/${tripId}/recaps/${recapId}/pdf${params}`, {
    headers,
  });
  if (!res.ok) {
    throw new ApiError(await readError(res), res.status);
  }

  const fileName = `${(options?.fileName ?? 'trip-recap').replace(/[^a-z0-9]/gi, '_')}.pdf`;
  if (Platform.OS === 'web') {
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  // Native: write to cache and hand off to the share sheet (same pattern as exportIcs).
  const buffer = await res.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  const base64 = btoa(binary);
  const FileSystem = await import('expo-file-system');
  const Sharing = await import('expo-sharing');
  const cacheDir = (FileSystem as any).cacheDirectory ?? (FileSystem as any).Paths?.cache ?? '';
  const path = `${cacheDir}${fileName}`;
  await (FileSystem as any).writeAsStringAsync(path, base64, { encoding: 'base64' });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  }
}

// ── Sharing & collaboration (Phase 7) ────────────────────────────────────────

/** Owner-side: list a trip's active (non-revoked) share links. */
export async function getTripShares(tripId: string): Promise<TripShareLink[]> {
  return sendJson<TripShareLink[]>(`/api/trips/${tripId}/shares`, 'GET');
}

/** Owner-side: mint a new share link granting Viewer or Editor access. */
export async function createTripShare(
  tripId: string,
  role: Exclude<TripRole, 'Owner'>,
  expiresAt?: string | null,
): Promise<TripShareLink> {
  return sendJson<TripShareLink>(`/api/trips/${tripId}/shares`, 'POST', {
    role,
    expiresAt: expiresAt ?? null,
  });
}

export async function revokeTripShare(tripId: string, shareId: string): Promise<void> {
  await sendJson<void>(`/api/trips/${tripId}/shares/${shareId}`, 'DELETE');
}

/** Absolute, shareable URL for a link token (the API hosts the landing/redeem flow). */
export function shareAbsoluteUrl(shareUrl: string): string {
  return `${API_BASE}${shareUrl}`;
}

/** Owner-side: list a trip's account members. */
export async function getTripMembers(tripId: string): Promise<TripMember[]> {
  return sendJson<TripMember[]>(`/api/trips/${tripId}/members`, 'GET');
}

/** Owner-side: invite a registered user by email at the given role. */
export async function inviteTripMember(
  tripId: string,
  email: string,
  role: Exclude<TripRole, 'Owner'>,
): Promise<TripMember> {
  return sendJson<TripMember>(`/api/trips/${tripId}/members`, 'POST', { email, role });
}

export async function changeTripMemberRole(
  tripId: string,
  memberId: string,
  role: Exclude<TripRole, 'Owner'>,
): Promise<void> {
  await sendJson<void>(`/api/trips/${tripId}/members/${memberId}`, 'PUT', { role });
}

export async function removeTripMember(tripId: string, memberId: string): Promise<void> {
  await sendJson<void>(`/api/trips/${tripId}/members/${memberId}`, 'DELETE');
}

/** Caller's sharing/publishing/AI consent flags. Sharing is explicit opt-in (Phase 7, Slice 5). */
export interface ConsentSettings {
  shareEnabled: boolean;
  publishEnabled: boolean;
  aiUseEnabled: boolean;
  aiTrainingEnabled: boolean;
}

export async function getConsent(): Promise<ConsentSettings> {
  return sendJson<ConsentSettings>('/api/consent', 'GET');
}

export async function updateConsent(update: Partial<ConsentSettings>): Promise<ConsentSettings> {
  return sendJson<ConsentSettings>('/api/consent', 'PUT', update);
}

/** All (non-revoked) reactions across a trip — trip/item/recap targets alike. */
export async function getTripReactions(tripId: string): Promise<Reaction[]> {
  return sendJson<Reaction[]>(`/api/trips/${tripId}/reactions`, 'GET');
}

/** Toggles the caller's emoji on a target; a second toggle of the same emoji removes it. */
export async function toggleReaction(
  tripId: string,
  targetType: ReactionTargetType,
  targetId: string,
  emoji: string,
): Promise<{ added: boolean; reaction: Reaction }> {
  return sendJson(`/api/trips/${tripId}/reactions`, 'POST', { targetType, targetId, emoji });
}

// ── Public recaps & discovery (Phase 8) ──────────────────────────────────────

export type ModerationStatus = 'Pending' | 'Approved' | 'Rejected';
export type PiiType = 'Email' | 'Phone';

export interface PiiFinding {
  type: PiiType;
  value: string;
}

export interface PublicRecap {
  id: string;
  recapId: string;
  tripId: string;
  moderationStatus: ModerationStatus;
  moderationReason: string | null;
  places: string[];
  tags: string[];
  season: string | null;
  budgetBand: string | null;
  publishedAt: string;
}

export interface PublishRecapInput {
  places?: string[];
  tags?: string[];
  season?: string | null;
  budgetBand?: string | null;
  acknowledgePii?: boolean;
}

/** Thrown by {@link publishRecap} when PII is found and `acknowledgePii` wasn't set — nothing was
 * published. Carries the findings so the caller can offer a review-and-acknowledge step. */
export class PiiReviewRequiredError extends ApiError {
  constructor(readonly findings: PiiFinding[]) {
    super('This recap mentions an email or phone number. Remove it, or confirm it’s fine to publish.', 422);
    this.name = 'PiiReviewRequiredError';
  }
}

export async function publishRecap(
  tripId: string,
  recapId: string,
  input: PublishRecapInput,
): Promise<PublicRecap> {
  const baseHeaders = (await buildHeaders()) ?? {};
  const res = await fetch(`${API_BASE}/api/trips/${tripId}/recaps/${recapId}/publish`, {
    method: 'POST',
    headers: { ...baseHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (res.status === 422) {
    const body = await res.json();
    throw new PiiReviewRequiredError(body.findings ?? []);
  }
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  return (await res.json()) as PublicRecap;
}

/** The owner's publish status for a recap, or null if it's never been published. */
export async function getPublishStatus(tripId: string, recapId: string): Promise<PublicRecap | null> {
  const baseHeaders = (await buildHeaders()) ?? {};
  const res = await fetch(`${API_BASE}/api/trips/${tripId}/recaps/${recapId}/publish`, {
    headers: baseHeaders,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  return (await res.json()) as PublicRecap;
}

export async function unpublishRecap(tripId: string, recapId: string): Promise<void> {
  await sendJson<void>(`/api/trips/${tripId}/recaps/${recapId}/unpublish`, 'POST');
}

export interface SearchResult {
  publicRecapId: string;
  recapId: string;
  tripId: string;
  title: string;
  snippet: string;
  places: string[];
  tags: string[];
  season: string | null;
  budgetBand: string | null;
  publishedAt: string;
  relevance: number | null;
}

export interface SearchDiscoveryInput {
  q?: string;
  place?: string;
  tag?: string;
  season?: string;
  budgetBand?: string;
  take?: number;
}

/** Anonymous keyword + semantic search over approved public recaps. */
export async function searchDiscovery(input: SearchDiscoveryInput): Promise<SearchResult[]> {
  const params = new URLSearchParams();
  if (input.q) params.set('q', input.q);
  if (input.place) params.set('place', input.place);
  if (input.tag) params.set('tag', input.tag);
  if (input.season) params.set('season', input.season);
  if (input.budgetBand) params.set('budgetBand', input.budgetBand);
  if (input.take) params.set('take', String(input.take));
  const qs = params.toString();
  return sendJson<SearchResult[]>(`/api/discovery/search${qs ? `?${qs}` : ''}`, 'GET');
}

export interface DiscoveryCitation {
  publicRecapId: string;
  recapId: string;
  tripId: string;
  title: string;
  places: string[];
}

export interface DiscoveryAnswer {
  hasAnswer: boolean;
  answer: string | null;
  citations: DiscoveryCitation[];
}

/** Grounded Q&A over public recaps (authed — spends the caller's shared AI token quota). */
export async function askDiscovery(question: string): Promise<DiscoveryAnswer> {
  return sendJson<DiscoveryAnswer>('/api/discovery/ask', 'POST', { question });
}

/** Flags a published recap for moderator review; pulls it out of discovery immediately. */
export async function reportPublicRecap(publicRecapId: string, reason: string): Promise<void> {
  await sendJson<void>('/api/moderation/reports', 'POST', { publicRecapId, reason });
}

export interface ModerationQueueItem {
  publicRecapId: string;
  recapId: string;
  tripId: string;
  ownerId: string;
  moderationStatus: ModerationStatus;
  moderationReason: string | null;
  openReportCount: number;
  publishedAt: string;
}

/** Admin-gated: recaps pending review or carrying an open report. 403s for non-admins. */
export async function getModerationQueue(): Promise<ModerationQueueItem[]> {
  return sendJson<ModerationQueueItem[]>('/api/moderation/queue', 'GET');
}

export async function approveModerationItem(publicRecapId: string): Promise<void> {
  await sendJson<void>(`/api/moderation/queue/${publicRecapId}/approve`, 'POST');
}

export async function rejectModerationItem(publicRecapId: string, reason: string): Promise<void> {
  await sendJson<void>(`/api/moderation/queue/${publicRecapId}/reject`, 'POST', { reason });
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

/** Permanently deletes the signed-in traveler's account and everything they own. */
export async function deleteAccount(): Promise<void> {
  await sendJson<void>('/api/users/me', 'DELETE');
}

export async function updateNote(noteId: string, bodyText: string, version?: number): Promise<Note> {
  return sendJson<Note>(`/api/notes/${noteId}`, 'PUT', { bodyText, version: version ?? 0 });
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

/** Parses an XHR error response the same way {@link readError} does for a fetch `Response`. */
function xhrError(status: number, responseText: string): ApiError {
  try {
    const problem = JSON.parse(responseText);
    if (problem?.errors) {
      const first = Object.values(problem.errors as Record<string, string[]>)[0];
      if (first?.length) return new ApiError(first[0], status);
    }
    if (problem?.title) return new ApiError(problem.title as string, status);
  } catch {
    // fall through to the generic message below
  }
  return new ApiError(`Request failed (HTTP ${status})`, status);
}

/**
 * Uploads a multipart form via XMLHttpRequest rather than `fetch` — `fetch` has no upload-progress
 * event in any environment this app targets (web or React Native), while XHR's `upload.onprogress`
 * works in both, same as it always has for browser file uploads. An `ApiError` with `status`
 * `undefined` (no HTTP response at all — offline, DNS failure, timeout) matches `fetch`'s rejection
 * shape closely enough that {@link isOfflineError} still treats it as "queue for later".
 */
function postMultipart(path: string, form: FormData, onProgress?: (fraction: number) => void): Promise<Note> {
  return buildHeaders().then(
    (headers) =>
      new Promise<Note>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}${path}`);
        for (const [key, value] of Object.entries((headers ?? {}) as Record<string, string>)) {
          xhr.setRequestHeader(key, value);
        }
        if (onProgress) {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress(e.loaded / e.total);
          };
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText) as Note);
            } catch {
              reject(new ApiError('Malformed response from server.', xhr.status));
            }
          } else {
            reject(xhrError(xhr.status, xhr.responseText));
          }
        };
        xhr.onerror = () => reject(new ApiError('Network request failed', undefined));
        xhr.ontimeout = () => reject(new ApiError('Network request failed', undefined));
        // Don't set Content-Type — the platform adds the multipart boundary automatically.
        xhr.send(form as any);
      }),
  );
}

/** Uploads a recorded audio clip as a voice note (multipart). The API stores the audio and queues
 *  it for transcription; the transcript arrives asynchronously (visible after a refetch).
 *  `onProgress` (0–1) reports upload progress only — it doesn't cover server-side processing. */
export async function createVoiceNote(
  tripId: string,
  fields: CreateVoiceNoteFields,
  audio: UploadFile,
  fileName: string,
  onProgress?: (fraction: number) => void,
): Promise<Note> {
  const form = new FormData();
  form.append('Scope', fields.scope);
  if (fields.targetId) form.append('TargetId', fields.targetId);
  if (fields.bodyText) form.append('BodyText', fields.bodyText);
  if (fields.durationSeconds != null) form.append('DurationSeconds', String(Math.round(fields.durationSeconds)));
  if (fields.locale) form.append('Locale', fields.locale);
  appendFile(form, 'Audio', audio, fileName);
  return postMultipart(`/api/trips/${tripId}/notes/voice`, form, onProgress);
}

/** Uploads a photo as a photo note (multipart). No transcription is queued for images. */
export async function createPhotoNote(
  tripId: string,
  fields: CreatePhotoNoteFields,
  image: UploadFile,
  fileName: string,
  onProgress?: (fraction: number) => void,
): Promise<Note> {
  const form = new FormData();
  form.append('Scope', fields.scope);
  if (fields.targetId) form.append('TargetId', fields.targetId);
  if (fields.bodyText) form.append('BodyText', fields.bodyText);
  appendFile(form, 'Image', image, fileName);
  return postMultipart(`/api/trips/${tripId}/notes/photo`, form, onProgress);
}

/** Absolute URL for a media asset (used directly by native `Image`/`expo-audio` with auth headers). */
export function mediaUrl(tripId: string, mediaAssetId: string): string {
  return `${API_BASE}/api/trips/${tripId}/notes/media/${mediaAssetId}`;
}

/**
 * Asks the API for a short-lived signed (SAS) URL so media can be fetched directly from storage,
 * offloading bandwidth from the API. Returns the URL when the backend issues one, or `null` when it
 * can't (local dev store / non-signing credential) so callers fall back to authenticated streaming.
 */
export async function getMediaSasUrl(tripId: string, mediaAssetId: string): Promise<string | null> {
  try {
    const headers = await buildHeaders();
    const res = await fetch(`${mediaUrl(tripId, mediaAssetId)}/sas`, { headers });
    if (res.status === 204 || !res.ok) return null; // no SAS available → fall back
    const body = (await res.json()) as { url?: string };
    return body?.url ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns a playable/displayable URL for a media asset (web). Prefers a direct SAS URL (no proxying
 * through the API); otherwise fetches the bytes with auth into an object URL. Either way the result
 * is a string usable as an `<img>`/`<audio>` src; object URLs should be revoked by the caller.
 */
export async function fetchMediaObjectUrl(tripId: string, mediaAssetId: string): Promise<string> {
  const sas = await getMediaSasUrl(tripId, mediaAssetId);
  if (sas) return sas;
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
