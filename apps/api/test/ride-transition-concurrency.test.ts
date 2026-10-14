import { MemoryRideEventRepository } from '../src/modules/rides/index.js';
import { unitOfWork } from './helpers/unitOfWork.js';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  MemoryRideRepository,
  StartRideUseCase,
  type RideEntity,
} from '../src/modules/rides/index.js';

function arrivedRide(): RideEntity {
  const now = new Date();
  return {
    id: 'ride',
    bookerRiderId: 'rider',
    driverId: 'driver',
    vehicleId: null,
    vehicleCategory: 'CAB',
    status: 'DRIVER_ARRIVED',
    passenger: {
      riderId: 'rider',
      name: 'Passenger',
      phoneE164: '+919876543210',
      pickupOtpHash: createHash('sha256').update('1234').digest('hex'),
      pickupOtpExpiresAt: new Date(now.getTime() + 60000),
      otpAttempts: 0,
      maxOtpAttempts: 3,
    },
    pickup: { lat: 26.71, lng: 88.42, address: null },
    drop: { lat: 26.75, lng: 88.45, address: null },
    routeSnapshot: {
      provider: 'TEST',
      distanceM: 6000,
      durationSeconds: 600,
      polyline: '',
      calculatedAt: now,
    },
    zoneSnapshot: { classification: 'IN_CITY', cityZoneId: 'city' },
    pricingSnapshot: {
      pricingConfigId: 'price',
      pricingConfigVersion: 1,
      vehicleCategory: 'CAB',
      baseFarePaise: 5000,
      ratePerKmPaise: 1000,
      minimumFarePaise: 5000,
      bufferSurchargePaise: 0,
      negotiationFloorPercent: 80,
      negotiationCeilingPercent: 150,
      commissionPercent: 8,
      zoneType: 'IN_CITY',
    },
    suggestedFarePaise: 11000,
    proposedFarePaise: 11000,
    agreedFarePaise: 11000,
    cancellationReason: null,
    offeringExpiresAt: null,
    acceptedAt: now,
    arrivedAt: now,
    startedAt: null,
    completedAt: null,
    settledAt: null,
    cancelledAt: null,
    version: 4,
    createdAt: now,
    updatedAt: now,
  };
}

describe('Ride transition concurrency', () => {
  it('allows only one simultaneous trip start with the same pickup OTP', async () => {
    const rideRepo = new MemoryRideRepository();
    await rideRepo.save(arrivedRide());
    const start = new StartRideUseCase({ unitOfWork, rideEventRepo: new MemoryRideEventRepository(), rideRepo });
    const results = await Promise.allSettled([
      start.execute({ rideId: 'ride', driverId: 'driver', otp: '1234' }),
      start.execute({ rideId: 'ride', driverId: 'driver', otp: '1234' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await rideRepo.findById('ride'))?.version).toBe(5);
  });

  it('rejects a stale update and never creates an unknown ride', async () => {
    const repo = new MemoryRideRepository();
    const ride = arrivedRide();
    await repo.save(ride);
    expect(await repo.update({ ...ride, status: 'TRIP_STARTED', version: 5 }, 4)).not.toBeNull();
    expect(await repo.update({ ...ride, status: 'CANCELLED', version: 5 }, 4)).toBeNull();
    expect(await repo.update({ ...ride, id: 'missing', version: 5 }, 4)).toBeNull();
    expect(await repo.findById('missing')).toBeNull();
    expect((await repo.findById('ride'))?.status).toBe('TRIP_STARTED');
  });
});
