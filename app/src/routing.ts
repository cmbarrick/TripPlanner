import { Platform } from 'react-native';
import { toIcaoFlightNumber } from './airlineCodes';

// ── Haversine distance ────────────────────────────────────────────────────────

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Speed assumptions for straight-line estimates (conservative / urban).
const WALK_KMH  = 5;
const DRIVE_KMH = 30; // city average incl. lights/traffic

export function estimateMinutes(distanceKm: number, mode: 'walk' | 'drive'): number {
  const speed = mode === 'walk' ? WALK_KMH : DRIVE_KMH;
  return Math.max(1, Math.round((distanceKm / speed) * 60));
}

export interface TravelEstimate {
  distanceKm: number;
  walkingMinutes: number;
  drivingMinutes: number;
}

export function estimate(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): TravelEstimate {
  const d = haversineKm(lat1, lng1, lat2, lng2);
  return {
    distanceKm:    Math.round(d * 10) / 10,
    walkingMinutes: estimateMinutes(d, 'walk'),
    drivingMinutes: estimateMinutes(d, 'drive'),
  };
}

// ── Deep-link URL builders ────────────────────────────────────────────────────

export type TravelMode = 'driving' | 'walking' | 'transit';

interface LatLng { lat: number; lng: number }

/**
 * Builds a directions URL for a single origin → destination leg.
 * iOS: Apple Maps (`maps://`). Web + Android: Google Maps (`https://`).
 */
export function buildDirectionsUrl(
  origin: LatLng,
  destination: LatLng,
  mode: TravelMode = 'driving',
): string {
  if (Platform.OS === 'ios') {
    const dirflg = mode === 'driving' ? 'd' : mode === 'walking' ? 'w' : 'r';
    return (
      `maps://maps.apple.com/?saddr=${origin.lat},${origin.lng}` +
      `&daddr=${destination.lat},${destination.lng}&dirflg=${dirflg}`
    );
  }

  const gmMode = mode === 'driving' ? 'driving' : mode === 'walking' ? 'walking' : 'transit';
  return (
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${origin.lat},${origin.lng}` +
    `&destination=${destination.lat},${destination.lng}` +
    `&travelmode=${gmMode}`
  );
}

/**
 * Builds a multi-stop route URL (up to 8 intermediate waypoints for Google Maps).
 * Always uses Google Maps — Apple Maps URL scheme doesn't support multi-stop routes.
 */
export function buildRouteUrl(stops: LatLng[], mode: TravelMode = 'driving'): string {
  if (stops.length < 2) return '';
  const origin = stops[0]!;
  const destination = stops[stops.length - 1]!;
  const waypoints = stops.slice(1, -1).slice(0, 8); // Google Maps cap

  const wp = waypoints.length
    ? `&waypoints=${waypoints.map((s) => `${s.lat},${s.lng}`).join('|')}`
    : '';

  return (
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${origin.lat},${origin.lng}` +
    `&destination=${destination.lat},${destination.lng}` +
    wp +
    `&travelmode=${mode}`
  );
}

// ── Flight tracking ───────────────────────────────────────────────────────────

/**
 * FlightAware live tracking URL.
 * FlightAware requires ICAO airline codes (e.g. DAL4976, not DL4976).
 * We convert automatically so users can enter the IATA code from their ticket.
 */
export function flightAwareUrl(flightNumber: string): string {
  return `https://www.flightaware.com/live/flight/${toIcaoFlightNumber(flightNumber)}`;
}

/**
 * FlightRadar24 live tracking URL.
 * FR24 accepts IATA codes directly — no conversion needed.
 */
export function flightRadar24Url(flightNumber: string): string {
  const normalised = flightNumber.trim().toUpperCase().replace(/\s+/g, '');
  return `https://www.flightradar24.com/${normalised}`;
}

/** Formats a minute count for display: "<1 min", "5 min", "1 h 10 min". */
export function fmtMinutes(minutes: number): string {
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
