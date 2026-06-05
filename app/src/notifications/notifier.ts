import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ScheduledPromptNotification } from './types';

// Native (iOS/Android) implementation of the notification seam, backed by expo-notifications.
// The web target uses notifier.web.ts (Metro picks the right file per platform).

export interface NotificationDeepLink {
  tripId: string;
  itemId: string;
}

const CHANNEL_ID = 'reflection';
const ID_PREFIX = 'wander-prompt-';

// Show the banner even when the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Requests OS notification permission (and creates the Android channel). */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Reflection nudges',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/** Replaces our pending nudges with the given set (cancels only ours, leaves others untouched). */
export async function syncSchedule(items: ScheduledPromptNotification[]): Promise<void> {
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    existing
      .filter((n) => (n.identifier ?? '').startsWith(ID_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  for (const item of items) {
    await Notifications.scheduleNotificationAsync({
      identifier: item.id,
      content: {
        title: item.title,
        body: item.body,
        data: { tripId: item.tripId, itemId: item.itemId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: item.fireAt,
        channelId: CHANNEL_ID,
      },
    });
  }
}

/** Calls `handler` when the user taps a reflection nudge. Returns an unsubscribe function. */
export function registerResponseHandler(handler: (link: NotificationDeepLink) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { tripId?: unknown; itemId?: unknown };
    if (data?.tripId && data?.itemId) {
      handler({ tripId: String(data.tripId), itemId: String(data.itemId) });
    }
  });
  return () => sub.remove();
}
