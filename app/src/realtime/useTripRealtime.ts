import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE } from '../api';
import { getAuthStateSnapshot } from '../auth/session';
import { tripsQueryKey } from '../queries/trips';
import { tripReactionsQueryKey } from '../queries/reactions';
import { tripNotesQueryKey } from '../queries/notes';

export interface PresentUser {
  userId: string;
  displayName: string;
}

const DEV_USER_ID = process.env.EXPO_PUBLIC_DEV_USER_ID;

/**
 * Live trip co-editing (Phase 7, Slice 3). Connects to the SignalR `/hubs/trips` hub, joins the
 * trip's group, and:
 *  - refetches the trips tree when a peer changes this trip (`TripChanged`), and
 *  - tracks who else is currently viewing the trip (`Presence`).
 *
 * Realtime is best-effort: any connection failure is swallowed so the app stays fully usable
 * (manual refresh and all mutations still work) when the hub is unreachable.
 */
export function useTripRealtime(tripId: string | undefined): {
  present: PresentUser[];
  connected: boolean;
} {
  const queryClient = useQueryClient();
  const [present, setPresent] = useState<PresentUser[]>([]);
  const [connected, setConnected] = useState(false);
  // Keeps the latest tripId available to reconnect handlers without re-subscribing.
  const tripIdRef = useRef(tripId);
  tripIdRef.current = tripId;

  useEffect(() => {
    if (!tripId) return;

    let cancelled = false;
    let connection: import('@microsoft/signalr').HubConnection | undefined;

    (async () => {
      try {
        const signalR = await import('@microsoft/signalr');

        // Browsers can't set headers on the WS handshake: JWT rides in `access_token` (via
        // accessTokenFactory) and the dev identity rides in `dev_user_id` on the query string.
        const params = new URLSearchParams();
        if (!getAuthStateSnapshot().accessToken && DEV_USER_ID) {
          params.set('dev_user_id', DEV_USER_ID);
        }
        const qs = params.toString();
        const url = `${API_BASE}/hubs/trips${qs ? `?${qs}` : ''}`;

        connection = new signalR.HubConnectionBuilder()
          .withUrl(url, {
            accessTokenFactory: () => getAuthStateSnapshot().accessToken ?? '',
          })
          .withAutomaticReconnect()
          .build();

        connection.on('TripChanged', (msg: { tripId: string; changeKind?: string }) => {
          if (msg?.tripId !== tripIdRef.current) return;
          // Targeted invalidation: reactions/notes have their own caches so a peer's reaction
          // toggle or comment doesn't force a full trip refetch — everything else still does.
          if (msg.changeKind === 'reactions') {
            queryClient.invalidateQueries({ queryKey: tripReactionsQueryKey(msg.tripId) });
          } else if (msg.changeKind === 'notes') {
            queryClient.invalidateQueries({ queryKey: tripNotesQueryKey(msg.tripId) });
          } else {
            queryClient.invalidateQueries({ queryKey: tripsQueryKey });
          }
        });

        connection.on('Presence', (msg: { tripId: string; present: PresentUser[] }) => {
          if (msg?.tripId === tripIdRef.current) {
            setPresent(msg.present ?? []);
          }
        });

        connection.onreconnected(() => {
          const current = tripIdRef.current;
          if (current) connection?.invoke('JoinTrip', current).catch(() => {});
        });
        connection.onclose(() => setConnected(false));

        await connection.start();
        if (cancelled) {
          await connection.stop();
          return;
        }
        await connection.invoke('JoinTrip', tripId);
        setConnected(true);
      } catch {
        // Best-effort: realtime is an enhancement, not a requirement.
      }
    })();

    return () => {
      cancelled = true;
      setConnected(false);
      setPresent([]);
      if (connection) {
        const c = connection;
        c.invoke('LeaveTrip', tripId).catch(() => {});
        c.stop().catch(() => {});
      }
    };
  }, [tripId, queryClient]);

  return { present, connected };
}
