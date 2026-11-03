import type { PublicTrustTier, TollSnapshot, VehicleCategory } from '@cabzone/contracts';

/** What dispatch needs to know about a driver account. Supplied by the composition root (identity). */
export interface DriverDispatchProfile {
  driverId: string;
  userId: string;
  eligibleToGoOnline: boolean;
  ineligibleReason?: string | undefined;
  /** Category of the driver's current approved vehicle; null when they have none. */
  vehicleCategory: VehicleCategory | null;
}

export interface DispatchLookups {
  getDriverProfileByUserId: (userId: string) => Promise<DriverDispatchProfile | null>;
  getUserIdForRider: (riderId: string) => Promise<string | null>;
  getUserIdForDriver: (driverId: string) => Promise<string | null>;
  /** Public trust tiers for riders, used on offer cards. Only riders whose score is public appear. */
  getRiderTrustTier?: (riderIds: string[]) => Promise<Map<string, PublicTrustTier>>;
  getDriverInfo?: (
    driverId: string,
  ) => Promise<{ name: string; phoneE164: string; registrationNumber?: string | undefined } | null>;
  isPointInCityZones?: (
    lat: number,
    lng: number,
    cityZoneIds: readonly string[],
  ) => Promise<boolean>;
}

export interface DispatchConfig {
  /** How far from the pickup a driver may be to receive an offer. */
  offerRadiusM: number;
  /** A driver whose last ping is older than this receives no offers. */
  locationMaxAgeMs: number;
  /** Max drivers pinged per ride. */
  maxCandidates: number;
}

export const DEFAULT_DISPATCH_CONFIG: DispatchConfig = {
  offerRadiusM: 5_000,
  locationMaxAgeMs: 60_000,
  maxCandidates: 10,
};

export interface RideOfferDto {
  tollSnapshot?: TollSnapshot | null;
  rideId: string;
  vehicleCategory: VehicleCategory;
  pickup: { lat: number; lng: number; address: string | null };
  drop: { lat: number; lng: number; address: string | null };
  stops?: { lat: number; lng: number; address: string | null }[];
  proposedFarePaise: number;
  /** The rider's public trust tier, when their score is public (D-048). */
  riderTrustTier?: PublicTrustTier | null;
  distanceToPickupM: number;
  expiresAt: string;
  negotiation: { floorPaise: number; ceilingPaise: number };
}
