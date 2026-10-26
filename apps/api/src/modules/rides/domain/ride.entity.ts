import type {
  CancellationReason,
  RidePricingSnapshot,
  RideStatus,
  VehicleCategory,
  ZoneClassificationType,
} from '@cabzone/contracts';

export interface PassengerInfo {
  riderId: string | null;
  name: string;
  phoneE164: string;
  pickupOtpHash: string | null;
  pickupOtpExpiresAt?: Date | null;
  otpAttempts?: number;
  maxOtpAttempts?: number;
}

export interface LocationPoint {
  lat: number;
  lng: number;
  address: string | null;
}

export interface RouteSnapshot {
  provider: string;
  distanceM: number;
  durationSeconds: number;
  polyline: string;
  calculatedAt: Date;
}

export interface ZoneSnapshot {
  classification: ZoneClassificationType;
  cityZoneId: string | null;
  /** Labels retained with the fare calculation snapshot. */
  routeScope?: 'INTRA_STATE' | 'INTERSTATE' | null;
  destinationStateCode?: string | null;
}

export interface RideEntity {
  id: string;
  bookerRiderId: string;
  idempotencyKey?: string | null;
  passenger: PassengerInfo;
  driverId: string | null;
  vehicleId: string | null;
  vehicleCategory: VehicleCategory;
  pickup: LocationPoint;
  drop: LocationPoint;
  routeSnapshot: RouteSnapshot;
  zoneSnapshot: ZoneSnapshot;
  pricingSnapshot: RidePricingSnapshot;
  suggestedFarePaise: number;
  proposedFarePaise: number | null;
  agreedFarePaise: number | null;
  /** Unpaid rider cancellation/no-show fee arrears attached to this ride (D-044). */
  arrearsPaise?: number;
  status: RideStatus;
  cancellationReason: CancellationReason | null;
  offeringExpiresAt: Date | null;
  acceptedAt: Date | null;
  arrivedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  settledAt: Date | null;
  cancelledAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export const VALID_RIDE_TRANSITIONS: Record<RideStatus, readonly RideStatus[]> = {
  REQUESTED: ['OFFERING', 'CANCELLED', 'EXPIRED'],
  OFFERING: ['DRIVER_ASSIGNED', 'CANCELLED', 'EXPIRED'],
  DRIVER_ASSIGNED: ['DRIVER_EN_ROUTE', 'CANCELLED'],
  DRIVER_EN_ROUTE: ['DRIVER_ARRIVED', 'CANCELLED'],
  DRIVER_ARRIVED: ['TRIP_STARTED', 'CANCELLED'],
  TRIP_STARTED: ['TRIP_COMPLETED'],
  TRIP_COMPLETED: ['PAYMENT_PENDING', 'SETTLED'],
  PAYMENT_PENDING: ['PAYMENT_CONFIRMED', 'PAYMENT_DISPUTED', 'SETTLED'],
  PAYMENT_CONFIRMED: ['SETTLED'],
  PAYMENT_DISPUTED: ['SETTLED'],
  SETTLED: ['PAYMENT_DISPUTED'],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransitionRide(from: RideStatus, to: RideStatus): boolean {
  return VALID_RIDE_TRANSITIONS[from].includes(to);
}

export function canCancelRide(status: RideStatus): boolean {
  return ['REQUESTED', 'OFFERING', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED'].includes(
    status,
  );
}
