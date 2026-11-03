/**
 * Pure helpers for the "Choose on map" picker (fixed centre pin, moving map).
 * Kept free of React Native imports so they can be unit tested with `node --test`.
 */

export interface PickedPointDetails {
  countryCode?: string | null | undefined;
  formattedAddress?: string | null | undefined;
  city?: string | null | undefined;
  state?: string | null | undefined;
}

export type PickedPointStatus = 'ok' | 'unserviceable';

/** The map has to sit still this long before the pin drops and the address is looked up. */
export const MAP_SETTLE_MS = 400;

/** Keep the map readable: roughly city-wide at the far end, street-level at the near end. */
export const MAP_MIN_ZOOM = 10;
export const MAP_MAX_ZOOM = 19;

/** Addresses that tell a driver nothing. The rider is asked for a landmark instead. */
const VAGUE_ADDRESS = /^(unnamed road|unnamed street|unknown location|selected location|current location)\b/i;

export function isVagueAddress(address: string | null | undefined): boolean {
  const text = (address ?? '').trim();
  if (!text) return true;
  const first = text.split(',')[0]!.trim();
  return VAGUE_ADDRESS.test(first) || /^[A-Z0-9]{3,5}\+[A-Z0-9]{2,}\b/.test(first);
}

/**
 * The pin is serviceable unless the geocoder places it outside India (for example across the
 * border). Rides are priced per state, so any Indian point is bookable; the quote step still
 * rejects points it cannot route.
 */
export function classifyPickedPoint(details: PickedPointDetails | null): PickedPointStatus {
  const country = details?.countryCode?.trim().toUpperCase();
  if (country && country !== 'IN') return 'unserviceable';
  return 'ok';
}

/** Short title + area for the bottom card, from a formatted address. */
export function splitAddress(address: string): { title: string; area: string } {
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return { title: 'Selected location', area: '' };
  return { title: parts[0]!, area: parts.slice(1, 3).join(', ') };
}

/** Prefer the geocoder's full address; fall back to city/state; never return an empty label. */
export function labelForDetails(details: PickedPointDetails | null): string {
  const formatted = details?.formattedAddress?.trim();
  if (formatted) return formatted;
  const cityState = [details?.city, details?.state]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
  return cityState || 'Selected location';
}

/** Appends the rider's landmark note so the driver sees it in the address. */
export function withLandmark(address: string, landmark: string): string {
  const note = landmark.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!note) return address;
  return isVagueAddress(address) ? note : `${address} (${note})`;
}

export function clampLatitude(lat: number): number {
  return Math.max(-85, Math.min(85, lat));
}

/** Rounds like the rest of the app (5 decimals, about 1 m) so repeat taps hash to the same place. */
export function roundCoordinate(value: number): number {
  return Number(value.toFixed(5));
}
