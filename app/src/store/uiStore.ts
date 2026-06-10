import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { TabKey } from '../components';
import { TempUnit } from '../screens/ProfileScreen';

type TripView = 'list' | 'detail' | 'add' | 'form';
export type ClockPref = '12h' | '24h';

/**
 * Cross-platform persistence for on-device preferences: localStorage on web,
 * expo-secure-store on native. All calls are guarded so a missing/locked store
 * (e.g. in tests) degrades to in-memory rather than throwing.
 */
const prefStorage: StateStorage = {
  getItem: async (name) => {
    try {
      if (Platform.OS === 'web') {
        return typeof localStorage !== 'undefined' ? localStorage.getItem(name) : null;
      }
      return await SecureStore.getItemAsync(name);
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      if (Platform.OS === 'web') {
        if (typeof localStorage !== 'undefined') localStorage.setItem(name, value);
        return;
      }
      await SecureStore.setItemAsync(name, value);
    } catch {
      /* ignore: preference persistence is best-effort */
    }
  },
  removeItem: async (name) => {
    try {
      if (Platform.OS === 'web') {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(name);
        return;
      }
      await SecureStore.deleteItemAsync(name);
    } catch {
      /* ignore */
    }
  },
};

type UiState = {
  tab: TabKey;
  tripView: TripView;
  openTripId: string | null;
  editingTripId: string | null;
  addItemDayId: string | null;
  editingItemId: string | null;
  unit: TempUnit;
  clock: ClockPref;
  setTab: (tab: TabKey) => void;
  openTrip: (tripId: string) => void;
  backToList: () => void;
  showAddItem: (dayId: string) => void;
  showEditItem: (itemId: string) => void;
  closeAddActivity: () => void;
  showCreateTrip: () => void;
  showEditTrip: (tripId: string) => void;
  closeTripForm: () => void;
  setUnit: (unit: TempUnit) => void;
  setClock: (clock: ClockPref) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
  tab: 'trips',
  tripView: 'list',
  openTripId: null,
  editingTripId: null,
  addItemDayId: null,
  editingItemId: null,
  unit: 'F',
  clock: '12h',
  setTab: (tab) =>
    set((state) => {
      if (tab === 'trips') return { tab };
      // Keep openTripId on Assistant so generate/apply targets the trip the user was viewing.
      const resetPlanner = tab !== 'assistant';
      return {
        ...state,
        tab,
        ...(resetPlanner && {
          tripView: 'list',
          openTripId: null,
          editingTripId: null,
          addItemDayId: null,
          editingItemId: null,
        }),
      };
    }),
  openTrip: (tripId) =>
    set({
      openTripId: tripId,
      tripView: 'detail',
      tab: 'trips',
    }),
  backToList: () =>
    set({
      openTripId: null,
      editingTripId: null,
      addItemDayId: null,
      editingItemId: null,
      tripView: 'list',
    }),
  showAddItem: (dayId) => set({ tripView: 'add', addItemDayId: dayId, editingItemId: null }),
  showEditItem: (itemId) => set({ tripView: 'add', editingItemId: itemId, addItemDayId: null }),
  closeAddActivity: () => set({ tripView: 'detail', addItemDayId: null, editingItemId: null }),
  showCreateTrip: () => set({ tripView: 'form', editingTripId: null, tab: 'trips' }),
  showEditTrip: (tripId) => set({ tripView: 'form', editingTripId: tripId, tab: 'trips' }),
  closeTripForm: () =>
    set((state) => ({
      tripView: state.editingTripId ? 'detail' : 'list',
      openTripId: state.editingTripId ?? state.openTripId,
      editingTripId: null,
    })),
  setUnit: (unit) => set({ unit }),
  setClock: (clock) => set({ clock }),
    }),
    {
      name: 'wander-ui-prefs',
      storage: createJSONStorage(() => prefStorage),
      partialize: (state) => ({ unit: state.unit, clock: state.clock }),
    }
  )
);
