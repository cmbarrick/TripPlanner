import { create } from 'zustand';
import { AiTripChange, AiUndoStep } from '../api';

export type AiBatch = {
  batchId: string;
  tripId: string;
  changes: AiTripChange[];
  undoSteps: AiUndoStep[];
  undone: boolean;
};

type AiBatchState = {
  lastByTrip: Record<string, AiBatch>;
  setBatch: (batch: AiBatch) => void;
  markUndone: (tripId: string) => void;
};

export const useAiBatchStore = create<AiBatchState>((set) => ({
  lastByTrip: {},
  setBatch: (batch) =>
    set((s) => ({ lastByTrip: { ...s.lastByTrip, [batch.tripId]: batch } })),
  markUndone: (tripId) =>
    set((s) => {
      const cur = s.lastByTrip[tripId];
      if (!cur) return s;
      return { lastByTrip: { ...s.lastByTrip, [tripId]: { ...cur, undone: true } } };
    }),
}));
