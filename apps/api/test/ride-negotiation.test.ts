import { describe, expect, it } from 'vitest';
import { pendingCounters } from '../src/modules/rides/application/useCases/negotiateFare.usecase.js';
import type { RideEventEntity } from '../src/modules/rides/domain/rideEvent.entity.js';
import {
  canCancelRide,
  canTransitionRide,
  cancelRideSchema,
  FareNegotiationModel,
  isNegotiationWithinBounds,
  proposeFareSchema,
  requestRideSchema,
  RideEventModel,
  RideExtensionModel,
  RideModel,
  type RideEntity,
} from '../src/modules/rides/index.js';

describe('Ride State Machine Invariants', () => {
  it('allows valid progressive transitions', () => {
    expect(canTransitionRide('REQUESTED', 'OFFERING')).toBe(true);
    expect(canTransitionRide('OFFERING', 'DRIVER_ASSIGNED')).toBe(true);
    expect(canTransitionRide('DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE')).toBe(true);
    expect(canTransitionRide('DRIVER_EN_ROUTE', 'DRIVER_ARRIVED')).toBe(true);
    expect(canTransitionRide('DRIVER_ARRIVED', 'TRIP_STARTED')).toBe(true);
    expect(canTransitionRide('TRIP_STARTED', 'TRIP_COMPLETED')).toBe(true);
    expect(canTransitionRide('TRIP_COMPLETED', 'PAYMENT_PENDING')).toBe(true);
    expect(canTransitionRide('PAYMENT_PENDING', 'SETTLED')).toBe(true);
  });

  it('rejects invalid or backwards transitions', () => {
    expect(canTransitionRide('REQUESTED', 'TRIP_STARTED')).toBe(false);
    expect(canTransitionRide('TRIP_STARTED', 'REQUESTED')).toBe(false);
    expect(canTransitionRide('SETTLED', 'TRIP_COMPLETED')).toBe(false);
    expect(canTransitionRide('CANCELLED', 'OFFERING')).toBe(false);
  });

  it('enforces cancellation rules per lifecycle stage', () => {
    // Cancellable before trip starts
    expect(canCancelRide('REQUESTED')).toBe(true);
    expect(canCancelRide('OFFERING')).toBe(true);
    expect(canCancelRide('DRIVER_ASSIGNED')).toBe(true);
    expect(canCancelRide('DRIVER_ARRIVED')).toBe(true);

    // Non-cancellable once trip is in progress or completed
    expect(canCancelRide('TRIP_STARTED')).toBe(false);
    expect(canCancelRide('TRIP_COMPLETED')).toBe(false);
    expect(canCancelRide('SETTLED')).toBe(false);
  });
});

describe('Fare Negotiation Invariants', () => {
  it('ignores legacy events without metadata when deriving counters', () => {
    const legacy = {
      eventType: 'RIDE_CREATED',
      metadata: undefined,
      createdAt: new Date(),
    } as unknown as RideEventEntity;
    expect(pendingCounters([legacy])).toEqual([]);
  });
  it('validates proposed fare against negotiation floor and ceiling bounds', () => {
    const bounds = { floorPaise: 8000, ceilingPaise: 15000 };

    expect(
      isNegotiationWithinBounds({
        proposedFarePaise: 10000,
        ...bounds,
      }),
    ).toBe(true);

    // Below floor
    expect(
      isNegotiationWithinBounds({
        proposedFarePaise: 7500,
        ...bounds,
      }),
    ).toBe(false);

    // Above ceiling
    expect(
      isNegotiationWithinBounds({
        proposedFarePaise: 16000,
        ...bounds,
      }),
    ).toBe(false);
  });
});

describe('Ride Boundary Validations (Zod Schemas)', () => {
  it('validates requestRide payload', () => {
    const valid = {
      passenger: {
        name: 'Amit Kumar',
        phoneE164: '+919876543210',
      },
      vehicleCategory: 'CAB' as const,
      pickup: {
        lat: 26.7271,
        lng: 88.3953,
        address: 'Siliguri Junction',
      },
      drop: {
        lat: 26.6858,
        lng: 88.3286,
        address: 'Bagdogra Airport',
      },
      proposedFarePaise: 65000,
    };

    expect(requestRideSchema.safeParse(valid).success).toBe(true);

    // Invalid coordinates
    expect(
      requestRideSchema.safeParse({
        ...valid,
        pickup: { ...valid.pickup, lat: 95 }, // lat > 90
      }).success,
    ).toBe(false);

    // Invalid phone
    expect(
      requestRideSchema.safeParse({
        ...valid,
        passenger: { ...valid.passenger, phoneE164: '9876543210' },
      }).success,
    ).toBe(false);
  });

  it('validates proposeFare and cancelRide schemas', () => {
    expect(proposeFareSchema.safeParse({ proposedFarePaise: 5000 }).success).toBe(true);
    expect(proposeFareSchema.safeParse({ proposedFarePaise: -100 }).success).toBe(false);

    expect(cancelRideSchema.safeParse({ reason: 'RIDER_CHANGED_MIND' }).success).toBe(true);
    expect(cancelRideSchema.safeParse({ reason: 'INVALID_REASON' }).success).toBe(false);
  });
});

describe('Mongoose Persistence Models', () => {
  it('registers ride and negotiation models with correct collection names', () => {
    expect(RideModel.collection.name).toBe('rides');
    expect(RideEventModel.collection.name).toBe('ride_events');
    expect(FareNegotiationModel.collection.name).toBe('fare_negotiations');
    expect(RideExtensionModel.collection.name).toBe('ride_extensions');
  });
});
