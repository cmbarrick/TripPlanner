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
    state = { ...DEFAULT_NOTIFICATION_SETTINGS, ...s, eventTypes: s.eventTypes ?? DEFAULT_NOTIFICATION_SETTINGS.eventTypes };
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
};

export interface UseNotificationSettings {
  settings: NotificationSettings;
  ready: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  setDelayMinutes: (delayMinutes: number) => Promise<void>;
  toggleEventType: (type: ItineraryItemType) => Promise<void>;
  setQuietHours: (start: number, end: number) => Promise<void>;
}

export function useNotificationSettings(): UseNotificationSettings {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    settings,
    ready: loaded,
    setEnabled: notificationStore.setEnabled,
    setDelayMinutes: notificationStore.setDelayMinutes,
    toggleEventType: notificationStore.toggleEventType,
    setQuietHours: notificationStore.setQuietHours,
  };
}
