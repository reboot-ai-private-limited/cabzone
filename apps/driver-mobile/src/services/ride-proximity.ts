/** Mirrors the API geofence (apps/api/src/modules/rides/application/geofence.ts). */
export const ARRIVE_RADIUS_M = 200;
export const COMPLETE_RADIUS_M = 500;

interface Point {
  lat: number;
  lng: number;
}

export function distanceMeters(a: Point, b: Point): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export interface ProximityInfo {
  /** e.g. "320 m from pickup" */
  label: string;
  /** True once the driver is inside the radius the server requires. */
  within: boolean;
  /** What the driver needs to do, e.g. "Move within 200 m to mark arrival". */
  hint: string;
}

/**
 * Live distance to the point the driver is heading for. Only meaningful while driving to pickup
 * or on the trip; returns null otherwise or when there is no GPS fix. The server stays the
 * authority, so this is guidance and never blocks a button.
 */
export function proximityInfo(
  status: string,
  driver: Point | null | undefined,
  ride: { pickup: Point; drop: Point },
): ProximityInfo | null {
  if (!driver || !Number.isFinite(driver.lat) || !Number.isFinite(driver.lng)) return null;
  if (status === 'DRIVER_EN_ROUTE') {
    const meters = distanceMeters(driver, ride.pickup);
    const within = meters <= ARRIVE_RADIUS_M;
    return {
      label: `${formatDistance(meters)} from pickup`,
      within,
      hint: within
        ? 'You are at the pickup. You can mark arrival.'
        : `Move within ${ARRIVE_RADIUS_M} m of the pickup to mark arrival.`,
    };
  }
  if (status === 'TRIP_STARTED') {
    const meters = distanceMeters(driver, ride.drop);
    const within = meters <= COMPLETE_RADIUS_M;
    return {
      label: `${formatDistance(meters)} from drop`,
      within,
      hint: within
        ? 'You are at the destination. You can complete the trip.'
        : `Get within ${COMPLETE_RADIUS_M} m of the destination to complete the trip.`,
    };
  }
  return null;
}

/** Turns server errors such as "DRIVER_TOO_FAR_FROM_PICKUP: You must be within…" into plain language. */
export function friendlyRideError(message: string): string {
  const away = /currently about (\d+) m/.exec(message)?.[1];
  const radius = /within (\d+) m/.exec(message)?.[1];
  if (message.startsWith('DRIVER_TOO_FAR_FROM_PICKUP')) {
    return `${away ? `You are about ${away} m from the pickup. ` : ''}Move within ${radius ?? ARRIVE_RADIUS_M} m of the pickup to mark arrival.`;
  }
  if (message.startsWith('DRIVER_TOO_FAR_FROM_DROP')) {
    return `${away ? `You are about ${away} m from the destination. ` : ''}Get within ${radius ?? COMPLETE_RADIUS_M} m of the destination to complete the trip, or wait for the rider to end the trip early.`;
  }
  if (message.startsWith('DRIVER_LOCATION_UNAVAILABLE')) {
    return 'We cannot see your location yet. Turn on GPS, wait a few seconds for a fix, then try again.';
  }
  // Any other "SOME_CODE: message" error: show only the message.
  return message.replace(/^[A-Z][A-Z0-9_]{3,}:\s*/, '');
}
