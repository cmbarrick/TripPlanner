import { useSyncExternalStore } from 'react';
import { NoteScope, ItineraryItemType } from '../types';
import { readJson, writeJson } from '../storage';
import { JournalPrompt, PromptProvider } from './types';
import { createPromptProvider } from './promptProvider';

const STORAGE_KEY = 'wander.prompts.settings.v1';

export interface PromptSettings {
  /** Reflection prompts on/off everywhere. */
  enabledGlobal: boolean;
  /** Trips where prompts are explicitly turned off (overrides the global on). */
  disabledTripIds: string[];
  /** Traveler-authored prompts (stored on-device). */
  custom: JournalPrompt[];
}

const DEFAULTS: PromptSettings = { enabledGlobal: true, disabledTripIds: [], custom: [] };

let state: PromptSettings = DEFAULTS;
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
  loading = readJson<PromptSettings>(STORAGE_KEY, DEFAULTS).then((s) => {
    // Merge so older/partial persisted shapes don't drop new fields.
    state = { ...DEFAULTS, ...s, custom: s.custom ?? [], disabledTripIds: s.disabledTripIds ?? [] };
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

function getSnapshot(): PromptSettings {
  return state;
}

/** Whether reflection prompts are active for a given trip (global on, not turned off for the trip). */
export function promptsEnabledForTrip(settings: PromptSettings, tripId: string): boolean {
  return settings.enabledGlobal && !settings.disabledTripIds.includes(tripId);
}

function newId(): string {
  const c: any = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback for environments without crypto.randomUUID (some RN runtimes).
  return 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

async function update(mutator: (s: PromptSettings) => PromptSettings) {
  state = mutator(state);
  emit();
  await persist();
}

export const promptStore = {
  setEnabledGlobal(enabled: boolean) {
    return update((s) => ({ ...s, enabledGlobal: enabled }));
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
  addCustomPrompt(text: string, scopes: NoteScope[], eventTypes?: ItineraryItemType[]): JournalPrompt {
    const prompt: JournalPrompt = {
      id: newId(),
      text: text.trim(),
      scopes: scopes.length ? scopes : ['Event', 'Day', 'Trip'],
      ...(eventTypes && eventTypes.length ? { eventTypes } : {}),
      isCustom: true,
    };
    void update((s) => ({ ...s, custom: [prompt, ...s.custom] }));
    return prompt;
  },
  removeCustomPrompt(id: string) {
    return update((s) => ({ ...s, custom: s.custom.filter((p) => p.id !== id) }));
  },
};

export interface UsePromptSettings {
  settings: PromptSettings;
  ready: boolean;
  provider: PromptProvider;
  enabledForTrip: (tripId: string) => boolean;
  setEnabledGlobal: (enabled: boolean) => Promise<void>;
  setTripEnabled: (tripId: string, enabled: boolean) => Promise<void>;
  addCustomPrompt: (text: string, scopes: NoteScope[], eventTypes?: ItineraryItemType[]) => JournalPrompt;
  removeCustomPrompt: (id: string) => Promise<void>;
}

/** Reactive access to prompt settings + a provider built from the current custom prompts. */
export function usePromptSettings(): UsePromptSettings {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    settings,
    ready: loaded,
    provider: createPromptProvider(settings.custom),
    enabledForTrip: (tripId: string) => promptsEnabledForTrip(settings, tripId),
    setEnabledGlobal: promptStore.setEnabledGlobal,
    setTripEnabled: promptStore.setTripEnabled,
    addCustomPrompt: promptStore.addCustomPrompt,
    removeCustomPrompt: promptStore.removeCustomPrompt,
  };
}
