import { ScheduledPromptNotification } from './types';

// Web implementation of the notification seam. The browser can't schedule OS notifications for when
// the tab is closed (that needs a service worker + push), so this is best-effort: it fires nudges
// that come due within the next day while the app stays open. Native uses notifier.ts.

export interface NotificationDeepLink {
  tripId: string;
  itemId: string;
}

const MAX_HORIZON_MS = 24 * 60 * 60 * 1000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let responseHandler: ((link: NotificationDeepLink) => void) | null = null;

type WebNotificationCtor = {
  new (title: string, options?: { body?: string }): { onclick: (() => void) | null };
  permission: 'default' | 'granted' | 'denied';
  requestPermission(): Promise<'default' | 'granted' | 'denied'>;
};

function getNotificationApi(): WebNotificationCtor | undefined {
  return typeof globalThis !== 'undefined'
    ? (globalThis as unknown as { Notification?: WebNotificationCtor }).Notification
    : undefined;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  const N = getNotificationApi();
  if (!N) return false;
  if (N.permission === 'granted') return true;
  if (N.permission === 'denied') return false;
  try {
    return (await N.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export async function syncSchedule(items: ScheduledPromptNotification[]): Promise<void> {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  const N = getNotificationApi();
  if (!N || N.permission !== 'granted') return;
  const now = Date.now();
  for (const item of items) {
    const delay = item.fireAt.getTime() - now;
    if (delay <= 0 || delay > MAX_HORIZON_MS) continue;
    const timer = setTimeout(() => {
      try {
        const notif = new N(item.title, { body: item.body });
        notif.onclick = () => responseHandler?.({ tripId: item.tripId, itemId: item.itemId });
      } catch {
        /* ignore best-effort web notification failures */
      }
      timers.delete(item.id);
    }, delay);
    timers.set(item.id, timer);
  }
}

export function registerResponseHandler(handler: (link: NotificationDeepLink) => void): () => void {
  responseHandler = handler;
  return () => {
    if (responseHandler === handler) responseHandler = null;
  };
}
