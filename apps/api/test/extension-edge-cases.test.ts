import { encodePolyline } from '@cabzone/geo';
import { describe, expect, it } from 'vitest';
import { MemoryRideEventRepository, MemoryRideRepository } from '../src/modules/rides/index.js';
import {
  RideExtensionsUseCase,
  type RideExtensionsDeps,
} from '../src/modules/rides/application/useCases/rideExtensions.usecase.js';
import { extensionRide } from './helpers/extensionRide.js';
import { unitOfWork } from './helpers/unitOfWork.js';

async function setup(overrides: Partial<RideExtensionsDeps> = {}) {
  const now = new Date('2026-10-29T10:00:00Z');
  const ride = extensionRide(now);
  const rideRepo = new MemoryRideRepository();
  const rideEventRepo = new MemoryRideEventRepository();
  await rideRepo.save(ride);
  const useCase = new RideExtensionsUseCase({
    rideRepo,
    rideEventRepo,
    unitOfWork,
    now: () => now,
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
      destinationStateCode: 'WB',
      routeScope: 'INTRA_STATE',
    }),
    segmentRoute: ({ totalDistanceM }) => [
      {
        stateCode: 'WB',
        stateName: 'West Bengal',
        distanceM: totalDistanceM,
        distanceKm: totalDistanceM / 1000,
        percentage: 100,
      },
    ],
    ...overrides,
  });
  const propose = (requestId = 'extension-intent-1') =>
    useCase.propose({
      rideId: ride.id,
      riderId: 'rider-1',
      requestId,
      newDrop: { lat: 26.75, lng: 88.46, address: 'New destination' },
    });
  return { ride, rideRepo, rideEventRepo, useCase, propose };
}

describe('Extension input integrity and concurrency', () => {
  it('fails closed when persisted GPS has an invalid timestamp instead of treating it as fresh', async () => {
    const h = await setup({
      getDriverLocation: async () => ({
        lat: 26.725,
        lng: 88.435,
        updatedAt: new Date(Number.NaN),
      }),
    });
    await expect(h.propose()).rejects.toThrow();
    expect((await h.rideRepo.findById(h.ride.id))?.extensionProposal).toBeUndefined();
    expect(await h.rideEventRepo.findByRideId(h.ride.id)).toHaveLength(0);
  });

  it('rejects whitespace route geometry instead of pricing an interpolated straight-line state split', async () => {
    const h = await setup({
      routing: {
        execute: async ({ origin, destination }) => ({
          provider: 'GOOGLE_ROUTES',
          distanceM: destination.lng === 88.44 ? 8000 : 13000,
          durationS: 600,
          polyline: '   ',
        }),
      },
    });
    await expect(h.propose()).rejects.toThrow();
    expect((await h.rideRepo.findById(h.ride.id))?.extensionProposal).toBeUndefined();
  });

  it('records one proposal when different rider intents race on the same ride version', async () => {
    const h = await setup();
    const results = await Promise.allSettled([
      h.propose('extension-intent-1'),
      h.propose('extension-intent-2'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const ride = await h.rideRepo.findById(h.ride.id);
    expect(ride?.version).toBe(h.ride.version + 1);
    expect(ride?.agreedFarePaise).toBe(h.ride.agreedFarePaise);
    expect(
      (await h.rideEventRepo.findByRideId(h.ride.id)).filter(
        (event) => event.eventType === 'EXTENSION_REQUESTED',
      ),
    ).toHaveLength(1);
  });

  it('applies only one outcome when driver acceptance and rejection race', async () => {
    const h = await setup();
    const proposal = (await h.propose()).extensionProposal!;
    const respond = (decision: 'ACCEPT' | 'REJECT') =>
      h.useCase.respond({
        rideId: h.ride.id,
        driverId: 'driver-1',
        extensionId: proposal.id,
        decision,
      });
    const results = await Promise.allSettled([respond('ACCEPT'), respond('REJECT')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const ride = await h.rideRepo.findById(h.ride.id);
    expect(ride?.version).toBe(h.ride.version + 2);
    expect(ride?.agreedFarePaise).toBe(
      ride?.extensionProposal?.status === 'ACCEPTED' ? 30000 : 25000,
    );
    expect(
      (await h.rideEventRepo.findByRideId(h.ride.id)).filter((event) =>
        ['RIDE_EXTENDED', 'EXTENSION_REJECTED'].includes(event.eventType),
      ),
    ).toHaveLength(1);
    expect(ride?.pricingSnapshot).toEqual(h.ride.pricingSnapshot);
  });
});
