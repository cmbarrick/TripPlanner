// Mirrors the Wander API contract (System.Text.Json camelCase).

export type ItineraryItemType =
  | 'Flight'
  | 'Lodging'
  | 'Food'
  | 'Activity'
  | 'Transport';

/** Lifecycle state, independent of whether the item has a date/time. */
export type ItineraryItemStatus = 'Confirmed' | 'Tentative' | 'Wishlist';

export interface ItineraryItem {
  id: string;
  tripId: string;
  /** Day the item is scheduled on, or null when it lives in the trip backlog. */
  dayId: string | null;
  type: ItineraryItemType;
  status: ItineraryItemStatus;
  title: string;
  /** IATA flight number, e.g. "BA 123". Only set when type === 'Flight'. */
  flightNumber?: string | null;
  locationName?: string | null;
  address?: string | null;
  placeId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  startTime?: string | null; // "HH:mm:ss"
  endTime?: string | null;
  cost?: number | null;
  currency: string;
  confirmationNo?: string | null;
  bookingUrl?: string | null; // e.g. GetYourGuide voucher / reservation link
  notes?: string | null;
  sortOrder: number;
}

export interface PackingItem {
  id: string;
  dayId: string;
  name: string;
  isPacked: boolean;
}

export interface Day {
  id: string;
  tripId: string;
  dayNumber: number;
  date: string; // "yyyy-MM-dd"
  weatherSummary?: string | null;
  weatherHighC?: number | null;
  weatherIcon?: string | null;
  items: ItineraryItem[];
  packingItems?: PackingItem[];
}

// ── Notes & journaling (Phase 4) ─────────────────────────────────────────────

export type NoteScope = 'Trip' | 'Day' | 'Event';
export type NoteKind = 'Text' | 'Voice' | 'PromptResponse';
export type MediaAssetKind = 'Audio' | 'Photo';
export type TranscriptionStatus = 'None' | 'Pending' | 'Completed' | 'Failed';

export interface MediaAsset {
  id: string;
  noteId: string;
  kind: MediaAssetKind;
  blobName: string;
  blobUrl?: string | null;
  contentType?: string | null;
  durationSeconds?: number | null;
  transcript?: string | null;
  transcriptionStatus: TranscriptionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  tripId: string;
  ownerId: string;
  scope: NoteScope;
  /** Day or itinerary-item id for Day/Event scope; null for Trip scope. */
  targetId?: string | null;
  kind: NoteKind;
  bodyText?: string | null;
  promptId?: string | null;
  /** For PromptResponse notes: the question text, persisted with the answer so it always displays. */
  promptText?: string | null;
  mediaAssets: MediaAsset[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  /** Client-only: set on optimistic notes that are queued in the offline outbox and not yet synced. */
  pendingSync?: boolean;
}

export interface Trip {
  id: string;
  ownerId: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  coverTheme: string;
  estimatedCost: number;
  currency: string;
  /** IANA time zone of the destination (e.g. "Europe/Rome"); used for notifications. */
  timeZoneId?: string | null;
  days: Day[];
  /** Unscheduled "Ideas" backlog: items with no day (dayId === null). */
  unscheduledItems?: ItineraryItem[];
  createdAt: string;
  updatedAt: string;
  nights: number;
  /**
   * The caller's role on this trip when it was shared with them (Phase 7): 'Owner' | 'Editor' |
   * 'Viewer'. Absent on trips the server didn't stamp (treated as 'Owner' — your own trips).
   */
  accessRole?: TripRole | null;
}

export type TripRole = 'Owner' | 'Editor' | 'Viewer';

// ── Sharing & collaboration (Phase 7) ────────────────────────────────────────

export interface TripShareLink {
  id: string;
  token: string;
  /** Relative URL of the share endpoint, e.g. "/api/shared/trips/{token}". */
  shareUrl: string;
  role: TripRole;
  expiresAt?: string | null;
  createdAt: string;
}

export interface TripMember {
  id: string;
  userId: string;
  email: string;
  role: TripRole;
  createdAt: string;
}

export type ReactionTargetType = 'Trip' | 'Item' | 'Recap';

export interface Reaction {
  id: string;
  targetType: ReactionTargetType;
  targetId: string;
  emoji: string;
  ownerId: string;
  createdAt: string;
}
