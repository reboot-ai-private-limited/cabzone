import { haversineDistanceM } from '@cabzone/geo';
import { AppError } from '../../../shared/errors/AppError.js';

/** Driver may mark arrived only this close to the pickup point. */
export const ARRIVE_RADIUS_M = 200;
/** Driver may complete the trip only this close to the drop point (otherwise early drop must be approved). */
export const COMPLETE_RADIUS_M = 500;
/** A driver location ping older than this is not trusted for proximity checks. */
export const DRIVER_LOCATION_MAX_AGE_MS = 60_000;

export interface DriverLocationPort {
  get(driverId: string): Promise<{ lat: number; lng: number; locationUpdatedAt: Date } | null>;
}

export async function assertDriverWithin(
  port: DriverLocationPort,
  driverId: string,
  target: { lat: number; lng: number },
  radiusM: number,
  code: 'DRIVER_TOO_FAR_FROM_PICKUP' | 'DRIVER_TOO_FAR_FROM_DROP',
  now: Date = new Date(),
): Promise<void> {
  const where = code === 'DRIVER_TOO_FAR_FROM_PICKUP' ? 'pickup' : 'drop-off';
  const loc = await port.get(driverId);
  if (!loc || now.getTime() - loc.locationUpdatedAt.getTime() > DRIVER_LOCATION_MAX_AGE_MS) {
    throw AppError.badRequest(
      'DRIVER_LOCATION_UNAVAILABLE: Turn on location and wait for a GPS fix, then try again.',
    );
  }
  const distanceM = haversineDistanceM({ lat: loc.lat, lng: loc.lng }, target);
  if (distanceM > radiusM) {
    throw AppError.badRequest(
      `${code}: You must be within ${radiusM} m of the ${where} (currently about ${Math.round(distanceM)} m away).`,
    );
  }
}
