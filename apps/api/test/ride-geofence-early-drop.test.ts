import { describe, expect, it } from 'vitest';
import {
  CompleteRideUseCase,
  DriverArrivedUseCase,
  MemoryRideEventRepository,
  MemoryRideRepository,
  type RideEntity,
} from '../src/modules/rides/index.js';
import { MemoryWalletRepository, type WalletEntity } from '../src/modules/ledger/index.js';
import { EarlyDropUseCase } from '../src/modules/rides/application/useCases/earlyDrop.usecase.js';
import type { DriverLocationPort } from '../src/modules/rides/application/geofence.js';

const DRIVER = '018f0a00-0000-7000-8000-000000000101';
const RIDER = '018f0a00-0000-7000-8000-000000000201';
const PICKUP = { lat: 26.71, lng: 88.42, address: null };
const DROP = { lat: 26.75, lng: 88.45, address: null };
// ~0.001 deg latitude is about 111 m.
const near = (p: { lat: number; lng: number }, metresNorth: number) => ({
  lat: p.lat + metresNorth / 111_000,
  lng: p.lng,
});

const unitOfWork = { run: <T>(fn: () => Promise<T>) => fn() };

function setup(status: RideEntity['status'], driverAt: { lat: number; lng: number } | null, ageMs = 0) {
  const rideRepo = new MemoryRideRepository();
  const rideEventRepo = new MemoryRideEventRepository();
  const walletRepo = new MemoryWalletRepository();
  const wallet: WalletEntity = {
    id: '018f0a00-0000-7000-8000-000000000301',
    driverId: DRIVER,
    balancePaise: 250000,
    lockedPaise: 0,
    currency: 'INR',
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  walletRepo.save(wallet);
  const ride = {
    id: '018f0a00-0000-7000-8000-000000000501',
    bookerRiderId: RIDER,
    driverId: DRIVER,
    pickup: PICKUP,
    drop: DROP,
    status,
    suggestedFarePaise: 12500,
    proposedFarePaise: 12500,
    agreedFarePaise: 12500,
    earlyDropRequestedAt: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as RideEntity;
  void rideRepo.save(ride);
  const driverLocation: DriverLocationPort = {
    get: async () =>
      driverAt ? { ...driverAt, locationUpdatedAt: new Date(Date.now() - ageMs) } : null,
  };
  const arrived = new DriverArrivedUseCase({ unitOfWork, rideRepo, rideEventRepo, driverLocation });
  const complete = new CompleteRideUseCase({ unitOfWork, rideRepo, walletRepo, rideEventRepo, driverLocation });
  const earlyDrop = new EarlyDropUseCase({
    unitOfWork,
    rideRepo,
    rideEventRepo,
    completeRide: (i) => complete.execute(i),
  });
  return { ride, rideRepo, arrived, complete, earlyDrop };
}

describe('driver proximity rules', () => {
  it('allows arrival within 200 m of pickup', async () => {
    const { ride, arrived } = setup('DRIVER_EN_ROUTE', near(PICKUP, 150));
    const out = await arrived.execute({ rideId: ride.id, driverId: DRIVER });
    expect(out.status).toBe('DRIVER_ARRIVED');
  });

  it('rejects arrival beyond 200 m of pickup', async () => {
    const { ride, arrived } = setup('DRIVER_EN_ROUTE', near(PICKUP, 260));
    await expect(arrived.execute({ rideId: ride.id, driverId: DRIVER })).rejects.toThrow(
      /DRIVER_TOO_FAR_FROM_PICKUP/,
    );
  });

  it('rejects arrival when the driver location is stale or missing', async () => {
    const stale = setup('DRIVER_EN_ROUTE', near(PICKUP, 10), 5 * 60_000);
    await expect(stale.arrived.execute({ rideId: stale.ride.id, driverId: DRIVER })).rejects.toThrow(
      /DRIVER_LOCATION_UNAVAILABLE/,
    );
    const none = setup('DRIVER_EN_ROUTE', null);
    await expect(none.arrived.execute({ rideId: none.ride.id, driverId: DRIVER })).rejects.toThrow(
      /DRIVER_LOCATION_UNAVAILABLE/,
    );
  });

  it('allows completion within 500 m of drop', async () => {
    const { ride, complete } = setup('TRIP_STARTED', near(DROP, 450));
    const out = await complete.execute({ rideId: ride.id, driverId: DRIVER });
    expect(out.ride.status).toBe('PAYMENT_PENDING');
  });

  it('rejects completion beyond 500 m of drop', async () => {
    const { ride, complete } = setup('TRIP_STARTED', near(DROP, 600));
    await expect(complete.execute({ rideId: ride.id, driverId: DRIVER })).rejects.toThrow(
      /DRIVER_TOO_FAR_FROM_DROP/,
    );
  });
});

describe('early drop', () => {
  const far = near(DROP, 3000);

  it('requires the rider to request before the driver can confirm', async () => {
    const { ride, earlyDrop } = setup('TRIP_STARTED', far);
    await expect(
      earlyDrop.respond({ rideId: ride.id, driverId: DRIVER, decision: 'ACCEPT' }),
    ).rejects.toThrow(/NO_EARLY_DROP_REQUEST/);
  });

  it('only the booking rider can request, and only during the trip', async () => {
    const { ride, earlyDrop } = setup('TRIP_STARTED', far);
    await expect(earlyDrop.request({ rideId: ride.id, riderId: 'someone-else' })).rejects.toThrow(
      /UNAUTHORIZED_RIDER/,
    );
    const waiting = setup('DRIVER_ARRIVED', far);
    await expect(
      waiting.earlyDrop.request({ rideId: waiting.ride.id, riderId: RIDER }),
    ).rejects.toThrow(/INVALID_RIDE_STATE/);
  });

  it('driver accept completes the trip far from the drop at the full agreed fare', async () => {
    const { ride, earlyDrop } = setup('TRIP_STARTED', far);
    const requested = await earlyDrop.request({ rideId: ride.id, riderId: RIDER });
    expect(requested.earlyDropRequestedAt).toBeInstanceOf(Date);
    const out = await earlyDrop.respond({ rideId: ride.id, driverId: DRIVER, decision: 'ACCEPT' });
    expect(out.completed).toBe(true);
    expect(out.ride.status).toBe('PAYMENT_PENDING');
    expect(out.ride.agreedFarePaise).toBe(12500);
  });

  it('driver decline clears the request and the trip stays active', async () => {
    const { ride, earlyDrop, complete } = setup('TRIP_STARTED', far);
    await earlyDrop.request({ rideId: ride.id, riderId: RIDER });
    const out = await earlyDrop.respond({ rideId: ride.id, driverId: DRIVER, decision: 'DECLINE' });
    expect(out.completed).toBe(false);
    expect(out.ride.status).toBe('TRIP_STARTED');
    expect(out.ride.earlyDropRequestedAt).toBeNull();
    await expect(complete.execute({ rideId: ride.id, driverId: DRIVER })).rejects.toThrow(
      /DRIVER_TOO_FAR_FROM_DROP/,
    );
  });

  it('a normal driver complete without a request is still blocked far from the drop', async () => {
    const { ride, complete } = setup('TRIP_STARTED', far);
    await expect(
      complete.execute({ rideId: ride.id, driverId: DRIVER, earlyDrop: true }),
    ).rejects.toThrow(/NO_EARLY_DROP_REQUEST/);
  });
});
