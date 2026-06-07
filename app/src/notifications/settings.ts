import { useSyncExternalStore } from 'react';
import { ItineraryItemType } from '../types';
import { readJson, writeJson } from '../storage';
import { NotificationSettings, DEFAULT_NOTIFICATION_SETTINGS } from './types';

const STORAGE_KEY = 'wander.notifications.settings.v1';

let state: NotificationSettings = DEFAULT_NOTIFICATION_SETTINGS;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

async function persist() {
  await writeJson(STORAGE_KEY, state);
}

function ensureLoaded() {
  if (loaded || loading) return;
  loading = readJson<NotificationSettings>(STORAGE_KEY, DEFAULT_NOTIFICATION_SETTINGS).then((s) => {
    // Merge over defaults so older persisted shapes pick up newly-added fields.
    state = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...s,
      eventTypes: s.eventTypes ?? DEFAULT_NOTIFICATION_SETTINGS.eventTypes,
      disabledTripIds: s.disabledTripIds ?? DEFAULT_NOTIFICATION_SETTINGS.disabledTripIds,
    };
    loaded = true;
    loading = null;
    emit();
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  ensureLoaded();
  return () => listeners.delete(cb);
}

function getSnapshot(): NotificationSettings {
  return state;
}

async function update(mutator: (s: NotificationSettings) => NotificationSettings) {
  state = mutator(state);
  emit();
  await persist();
}

export const notificationStore = {
  /** Current settings without subscribing (for the schedule sync that runs outside React). */
  get(): NotificationSettings {
    return state;
  },
  setEnabled(enabled: boolean) {
    return update((s) => ({ ...s, enabled }));
  },
  setDelayMinutes(delayMinutes: number) {
    return update((s) => ({ ...s, delayMinutes: Math.max(0, Math.round(delayMinutes)) }));
  },
  toggleEventType(type: ItineraryItemType) {
    return update((s) => ({
      ...s,
      eventTypes: s.eventTypes.includes(type)
        ? s.eventTypes.filter((t) => t !== type)
        : [...s.eventTypes, type],
    }));
  },
  setQuietHours(quietStartHour: number, quietEndHour: number) {
    return update((s) => ({ ...s, quietStartHour, quietEndHour }));
  },
  setTripEnabled(tripId: string, enabled: boolean) {
    return update((s) => ({
      ...s,
      disabledTripIds: enabled
        ? s.disabledTripIds.filter((id) => id !== tripId)
        : s.disabledTripIds.includes(tripId)
          ? s.disabledTripIds
          : [...s.disabledTripIds, tripId],
    }));
  },
};

/** Whether post-event nudges are active for a given trip (global on, not turned off for the trip). */
export function notificationsEnabledForTrip(settings: NotificationSettings, tripId: string): boolean {
  return settings.enabled && !settings.disabledTripIds.includes(tripId);
}

export interface UseNotificationSettings {
  settings: NotificationSettings;
  ready: boolean;
  enabledForTrip: (tripId: string) => boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  setDelayMinutes: (delayMinutes: number) => Promise<void>;
  toggleEventType: (type: ItineraryItemType) => Promise<void>;
  setQuietHours: (start: number, end: number) => Promise<void>;
  setTripEnabled: (tripId: string, enabled: boolean) => Promise<void>;
}

export function useNotificationSettings(): UseNotificationSettings {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    settings,
    ready: loaded,
    enabledForTrip: (tripId: string) => notificationsEnabledForTrip(settings, tripId),
    setEnabled: notificationStore.setEnabled,
    setDelayMinutes: notificationStore.setDelayMinutes,
    toggleEventType: notificationStore.toggleEventType,
    setQuietHours: notificationStore.setQuietHours,
    setTripEnabled: notificationStore.setTripEnabled,
  };
}
