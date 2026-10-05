import type { VehicleCategory } from './vehicles.js';

/**
 * Ride state machine statuses.
 *
 * Per Decisions:
 * - D-030: Atomic assignment (OFFERING -> DRIVER_ASSIGNED).
 * - D-031: Timeout to EXPIRED.
 * - D-032: State-based cancellation.
 * - D-033: Cash payment confirmation and PAYMENT_DISPUTED workflow.
 */
export const RIDE_STATUSES = [
  'REQUESTED',
  'OFFERING',
  'DRIVER_ASSIGNED',
  'DRIVER_EN_ROUTE',
  'DRIVER_ARRIVED',
  'TRIP_STARTED',
  'TRIP_COMPLETED',
  'PAYMENT_PENDING',
  'PAYMENT_CONFIRMED',
  'PAYMENT_DISPUTED',
  'SETTLED',
  'CANCELLED',
  'EXPIRED',
] as const;

export type RideStatus = (typeof RIDE_STATUSES)[number];

export const CANCELLATION_REASONS = [
  'RIDER_CHANGED_MIND',
  'DRIVER_DELAYED',
  'RIDER_NO_SHOW',
  'DRIVER_NO_SHOW',
  'FARE_DISAGREEMENT',
  'ADMIN_OVERRIDE',
  'TIMEOUT_EXPIRED',
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export type ZoneClassificationType = 'IN_CITY' | 'OUTSTATION' | 'INTERSTATE';

export interface StateSegmentDto {
  stateCode: string;
  distanceM: number;
  ratePerKmPaise: number;
  segmentFarePaise: number;
}

/**
 * Immutable pricing snapshot locked at ride creation.
 * Per Decision D-034.
 */
export interface RidePricingSnapshot {
  pricingConfigId: string;
  pricingConfigVersion: number;
  vehicleCategory: VehicleCategory;
  baseFarePaise: number;
  ratePerKmPaise: number;
  minimumFarePaise: number;
  bufferSurchargePaise: number;
  negotiationFloorPercent: number;
  negotiationCeilingPercent: number;
  commissionPercent: number;
  zoneType: ZoneClassificationType;
  stateSegments?: StateSegmentDto[];
}

export interface RideDto {
  id: string;
  riderId: string;
  driverId: string | null;
  status: RideStatus;
  vehicleCategory: VehicleCategory;
  pickup: {
    lat: number;
    lng: number;
    address?: string;
  };
  destination: {
    lat: number;
    lng: number;
    address?: string;
  };
  suggestedFarePaise: number;
  agreedFarePaise: number | null;
  pricingSnapshot: RidePricingSnapshot;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export const NEGOTIATION_ACTIONS = ['PROPOSED', 'REJECTED', 'ACCEPTED', 'EXPIRED'] as const;
export type NegotiationAction = (typeof NEGOTIATION_ACTIONS)[number];

export const NEGOTIATION_ACTORS = ['RIDER', 'DRIVER', 'SYSTEM'] as const;
export type NegotiationActor = (typeof NEGOTIATION_ACTORS)[number];

export interface FareNegotiationDto {
  id: string;
  rideId: string;
  actorType: NegotiationActor;
  actorId: string | null;
  previousFarePaise: number | null;
  proposedFarePaise: number;
  action: NegotiationAction;
  reasonCode: string | null;
  createdAt: string;
}

export const RIDE_EVENT_ACTORS = ['RIDER', 'DRIVER', 'ADMIN', 'SYSTEM'] as const;
export type RideEventActor = (typeof RIDE_EVENT_ACTORS)[number];

export interface RideEventDto {
  id: string;
  rideId: string;
  eventType: string;
  actorType: RideEventActor;
  actorId: string | null;
  previousStatus: RideStatus | null;
  newStatus: RideStatus | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export const EXTENSION_STATUSES = ['REQUESTED', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as const;
export type ExtensionStatus = (typeof EXTENSION_STATUSES)[number];

export interface RideExtensionDto {
  id: string;
  rideId: string;
  requestedBy: string;
  originalDrop: {
    lat: number;
    lng: number;
  };
  newDrop: {
    lat: number;
    lng: number;
  };
  additionalDistanceM: number;
  additionalFarePaise: number;
  status: ExtensionStatus;
  requestedAt: string;
  respondedAt: string | null;
}

