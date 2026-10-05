import type { VehicleCategory } from '@cabzone/contracts';

/** A driver who has gone online. Lives in a fast store (Redis), not the primary database. */
export interface DriverPresence {
  driverId: string;
  userId: string;
  vehicleCategory: VehicleCategory;
  lat: number;
  lng: number;
  heading: number | null;
  speedMps: number | null;
  /** Last location ping. Presence older than the freshness window is treated as stale. */
  locationUpdatedAt: Date;
}

export interface NearbyDriver extends DriverPresence {
  distanceM: number;
}

export interface FindNearbyQuery {
  lat: number;
  lng: number;
  radiusM: number;
  vehicleCategory: VehicleCategory;
  /** Ignore drivers whose last ping is older than this. */
  maxAgeMs: number;
  limit: number;
}

export interface DriverPresencePort {
  set(presence: DriverPresence): Promise<void>;
  get(driverId: string): Promise<DriverPresence | null>;
  remove(driverId: string): Promise<void>;
  /** Closest first. */
  findNearby(query: FindNearbyQuery): Promise<NearbyDriver[]>;
  /** Return all online drivers matching optional vehicleCategory and max age criteria. */
  listAll(options?: { vehicleCategory?: VehicleCategory | undefined; maxAgeMs?: number | undefined }): Promise<DriverPresence[]>;
}

const EARTH_RADIUS_M = 6_371_000;

export function haversineDistanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
