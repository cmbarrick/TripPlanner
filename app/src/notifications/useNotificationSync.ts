import { useEffect } from 'react';
import { Trip } from '../types';
import { useUiStore } from '../store/uiStore';
import { useNotificationSettings } from './settings';
import { computeEventNotifications } from './schedule';
import { registerResponseHandler, syncSchedule } from './notifier';

/**
 * Keeps OS-level reflection nudges in sync with the current trips + settings, and routes a tapped
 * nudge to that event's composer. Mounted once near the app root.
 */
export function useNotificationSync(trips: Trip[]): void {
  const { settings, ready } = useNotificationSettings();

  useEffect(() => {
    const unsubscribe = registerResponseHandler(({ tripId, itemId }) => {
      const ui = useUiStore.getState();
      ui.openTrip(tripId);
      ui.showEditItem(itemId);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!ready) return;
    const items = computeEventNotifications(trips, settings);
    void syncSchedule(items);
  }, [trips, settings, ready]);
}
