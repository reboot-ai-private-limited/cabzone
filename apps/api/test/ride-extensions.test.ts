import { encodePolyline } from '@cabzone/geo';
import { describe, expect, it } from 'vitest';
import {
  MemoryRideRepository,
  MemoryRideEventRepository,
  type RideEntity,
} from '../src/modules/rides/index.js';
import { RideExtensionsUseCase } from '../src/modules/rides/application/useCases/rideExtensions.usecase.js';
import { unitOfWork } from './helpers/unitOfWork.js';
import { extensionRide } from './helpers/extensionRide.js';
import { MemoryWalletRepository } from '../src/modules/ledger/index.js';
import { CompleteRideUseCase } from '../src/modules/rides/application/useCases/completeRide.usecase.js';

async function setup() {
  const rideRepo = new MemoryRideRepository();
  const rideEventRepo = new MemoryRideEventRepository();
  const now = new Date('2026-10-29T10:00:00Z');
  const ride = extensionRide(now);
  await rideRepo.save(ride);
  let clock = now;
  let stateCode = 'WB';
  const useCase = new RideExtensionsUseCase({
    rideRepo,
    rideEventRepo,
    unitOfWork,
    now: () => clock,
    getDriverLocation: async () => ({ lat: 26.725, lng: 88.435, updatedAt: now }),
    routing: {
      execute: async ({ origin, destination }) => ({
        provider: 'TEST',
        distanceM: destination.lng === ride.drop.lng ? 8000 : 13000,
        durationS: 600,
        polyline: encodePolyline([
          [origin.lng, origin.lat],
          [destination.lng, destination.lat],
        ]),
      }),
    },
    classify: async () => ({
      classification: 'IN_CITY',
      cityZoneId: 'city-1',
      destinationStateCode: stateCode,
      routeScope: stateCode === 'WB' ? 'INTRA_STATE' : 'INTERSTATE',
    }),
    segmentRoute: ({ totalDistanceM }) => [
      {
        stateCode,
        stateName: stateCode,
        distanceM: totalDistanceM,
        distanceKm: totalDistanceM / 1000,
        percentage: 100,
      },
    ],
  });
  const propose = () =>
    useCase.propose({
      rideId: ride.id,
      riderId: 'rider-1',
      requestId: 'intent-1',
      newDrop: { lat: 26.75, lng: 88.46, address: 'New destination' },
    });
  return {
    ride,
    rideRepo,
    rideEventRepo,
    useCase,
    propose,
    setNow: (value: Date) => {
      clock = value;
    },
    setState: (value: string) => {
      stateCode = value;
    },
  };
}

describe('Mid-trip extension contract', () => {
  it('settles the accepted fare plus arrears once and charges commission on fare only', async () => {
    const h = await setup();
    const proposed = await h.propose();
    await h.useCase.respond({
      rideId: h.ride.id,
      driverId: 'driver-1',
      extensionId: proposed.extensionProposal!.id,
      decision: 'ACCEPT',
    });
    const walletRepo = new MemoryWalletRepository();
    const now = new Date();
    await walletRepo.save({
      id: 'driver-wallet',
      driverId: 'driver-1',
      balancePaise: 10000,
      earningsBalancePaise: 0,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await walletRepo.save({
      id: 'rider-wallet',
      ownerType: 'RIDER',
      riderId: 'rider-1',
      driverId: '',
      balancePaise: -3000,
      owedPaise: 3000,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const payment = new CompleteRideUseCase({
      rideRepo: h.rideRepo,
      rideEventRepo: h.rideEventRepo,
      walletRepo,
      unitOfWork,
    });
    const input = { rideId: h.ride.id, driverId: 'driver-1' };
    await payment.execute(input);
    const result = await payment.confirmPayment(input);
    await payment.confirmPayment(input);
    expect(result.totalPayablePaise).toBe(33000);
    expect(result.commissionPaise).toBe(2400);
    expect((await walletRepo.findByDriverId('driver-1'))?.balancePaise).toBe(4600);
    expect((await walletRepo.findByRiderId('rider-1'))?.balancePaise).toBe(0);
  });
  it('charges only 5 additional km, preserves original snapshots and applies acceptance once', async () => {
    const h = await setup();
    const proposed = await h.propose();
    expect(proposed.extensionProposal?.additionalDistanceM).toBe(5000);
    expect(proposed.extensionProposal?.additionalFarePaise).toBe(5000);
    expect(proposed.agreedFarePaise).toBe(25000);
    expect((await h.propose()).extensionProposal?.id).toBe(proposed.extensionProposal?.id);
    const input = {
      rideId: h.ride.id,
      driverId: 'driver-1',
      extensionId: proposed.extensionProposal!.id,
      decision: 'ACCEPT' as const,
    };
    const accepted = await h.useCase.respond(input);
    await h.useCase.respond(input);
    expect(accepted.agreedFarePaise).toBe(30000);
    expect(accepted.arrearsPaise).toBe(3000);
    expect(accepted.pricingSnapshot).toEqual(h.ride.pricingSnapshot);
    expect(accepted.drop.address).toBe('New destination');
    expect(
      (await h.rideEventRepo.findByRideId(h.ride.id)).filter(
        (e) => e.eventType === 'RIDE_EXTENDED',
      ),
    ).toHaveLength(1);
  });

  it('retains original fare and destination on rejection', async () => {
    const h = await setup();
    const p = await h.propose();
    const result = await h.useCase.respond({
      rideId: h.ride.id,
      driverId: 'driver-1',
      extensionId: p.extensionProposal!.id,
      decision: 'REJECT',
    });
    expect(result.drop).toEqual(h.ride.drop);
    expect(result.agreedFarePaise).toBe(25000);
  });

  it('rejects an unfamiliar state tariff instead of looking up live rates', async () => {
    const h = await setup();
    h.setState('SK');
    await expect(h.propose()).rejects.toThrow('TARIFF');
    expect((await h.rideRepo.findById(h.ride.id))?.version).toBe(3);
  });

  it('rejects nonparticipants, a second pending request, stale GPS and expired acceptance', async () => {
    const h = await setup();
    await expect(
      h.useCase.propose({
        rideId: h.ride.id,
        riderId: 'other',
        requestId: 'x',
        newDrop: h.ride.drop,
      }),
    ).rejects.toThrow();
    const p = await h.propose();
    await expect(
      h.useCase.propose({
        rideId: h.ride.id,
        riderId: 'rider-1',
        requestId: 'other',
        newDrop: h.ride.drop,
      }),
    ).rejects.toThrow();
    await expect(
      h.useCase.respond({
        rideId: h.ride.id,
        driverId: 'other',
        extensionId: p.extensionProposal!.id,
        decision: 'ACCEPT',
      }),
    ).rejects.toThrow();
    h.setNow(new Date('2026-10-29T10:03:00Z'));
    await expect(
      h.useCase.respond({
        rideId: h.ride.id,
        driverId: 'driver-1',
        extensionId: p.extensionProposal!.id,
        decision: 'ACCEPT',
      }),
    ).rejects.toThrow('EXPIRED');
    await expect(
      h.useCase.propose({
        rideId: h.ride.id,
        riderId: 'rider-1',
        requestId: 'later',
        newDrop: h.ride.drop,
      }),
    ).rejects.toThrow('LOCATION');
  });

  it('refuses acceptance after trip completion changed the ride', async () => {
    const h = await setup();
    const p = await h.propose();
    await h.rideRepo.update({ ...p, status: 'PAYMENT_PENDING', version: p.version + 1 }, p.version);
    await expect(
      h.useCase.respond({
        rideId: h.ride.id,
        driverId: 'driver-1',
        extensionId: p.extensionProposal!.id,
        decision: 'ACCEPT',
      }),
    ).rejects.toThrow();
    expect((await h.rideRepo.findById(h.ride.id))?.agreedFarePaise).toBe(25000);
  });
});
