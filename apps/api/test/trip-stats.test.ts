import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CancellationReason, RideEventActor, RideStatus } from '@cabzone/contracts';
import {
  assertCancellationReasonAllowed,
  cancellationFault,
  computeTripStats,
  decayWeight,
  inferCancelledBy,
  type TripStatsRide,
} from '../src/modules/rides/domain/index.js';
import { MemoryRideRepository } from '../src/modules/rides/infrastructure/persistence/memoryRide.repository.js';
import { TrustScoreService } from '../src/modules/identity/application/trustScore.service.js';
import type { DriverEntity, RiderEntity, TrustSnapshot } from '../src/modules/identity/domain/index.js';

const NOW = new Date('2026-11-03T00:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

function ride(over: Partial<TripStatsRide> = {}): TripStatsRide {
  return {
    status: 'SETTLED',
    driverId: 'drv-1',
    bookerRiderId: 'rdr-1',
    cancellationReason: null,
    cancelledBy: null,
    cancelledAt: null,
    disputeOutcome: null,
    disputeResolvedAt: null,
    agreedFarePaise: 10_000,
    suggestedFarePaise: 10_000,
    updatedAt: NOW,
    ...over,
  };
}

const cancelled = (reason: CancellationReason, by: RideEventActor | null, over: Partial<TripStatsRide> = {}) =>
  ride({ status: 'CANCELLED', cancellationReason: reason, cancelledBy: by, cancelledAt: NOW, ...over });

describe('cancellation attribution (F3)', () => {
  const rows: Array<[CancellationReason, RideEventActor, 'RIDER' | 'DRIVER' | null, boolean]> = [
    ['RIDER_CHANGED_MIND', 'RIDER', 'RIDER', false],
    ['RIDER_CHANGED_MIND', 'DRIVER', null, false],
    ['RIDER_NO_SHOW', 'DRIVER', 'RIDER', true],
    ['RIDER_NO_SHOW', 'SYSTEM', null, false],
    ['DRIVER_DELAYED', 'DRIVER', 'DRIVER', false],
    ['DRIVER_DELAYED', 'RIDER', null, false], // a rider's claim is unverified
    ['DRIVER_NO_SHOW', 'DRIVER', 'DRIVER', true],
    ['DRIVER_NO_SHOW', 'RIDER', null, false],
    ['FARE_DISAGREEMENT', 'RIDER', null, false],
    ['FARE_DISAGREEMENT', 'DRIVER', null, false],
    ['ADMIN_OVERRIDE', 'ADMIN', null, false],
    ['TIMEOUT_EXPIRED', 'SYSTEM', null, false],
  ];
  it.each(rows)('%s cancelled by %s counts against %s', (reason, by, party, noShow) => {
    expect(cancellationFault({ cancelledBy: by, reason, wasAssigned: true })).toEqual({ party, noShow });
  });

  it('never counts a cancellation made before a driver was assigned', () => {
    expect(
      cancellationFault({ cancelledBy: 'RIDER', reason: 'RIDER_CHANGED_MIND', wasAssigned: false }).party,
    ).toBeNull();
  });

  it('infers the actor for older rides only when the reason is unambiguous', () => {
    expect(inferCancelledBy('RIDER_CHANGED_MIND')).toBe('RIDER');
    expect(inferCancelledBy('RIDER_NO_SHOW')).toBe('DRIVER');
    expect(inferCancelledBy('DRIVER_DELAYED')).toBeNull();
    expect(inferCancelledBy('FARE_DISAGREEMENT')).toBeNull();
  });

  it('only accepts reasons that fit the actor', () => {
    expect(() => assertCancellationReasonAllowed('RIDER', 'RIDER_CHANGED_MIND')).not.toThrow();
    expect(() => assertCancellationReasonAllowed('DRIVER', 'RIDER_NO_SHOW')).not.toThrow();
    expect(() => assertCancellationReasonAllowed('ADMIN', 'ADMIN_OVERRIDE')).not.toThrow();
    // a rider cannot report their own no-show, or a system timeout
    expect(() => assertCancellationReasonAllowed('RIDER', 'RIDER_NO_SHOW')).toThrow(/INVALID_CANCELLATION_REASON/);
    expect(() => assertCancellationReasonAllowed('RIDER', 'TIMEOUT_EXPIRED')).toThrow(/INVALID_CANCELLATION_REASON/);
    // a driver cannot blame a rider for changing their mind, or cancel as an admin
    expect(() => assertCancellationReasonAllowed('DRIVER', 'RIDER_CHANGED_MIND')).toThrow(/INVALID_CANCELLATION_REASON/);
    expect(() => assertCancellationReasonAllowed('DRIVER', 'ADMIN_OVERRIDE')).toThrow(/INVALID_CANCELLATION_REASON/);
  });
});

describe('computeTripStats', () => {
  it('does not penalise a rider for 40 cancellations the drivers and system caused', () => {
    const rides = [
      ...Array.from({ length: 20 }, () => cancelled('DRIVER_DELAYED', 'DRIVER')),
      ...Array.from({ length: 10 }, () => cancelled('DRIVER_NO_SHOW', 'DRIVER')),
      ...Array.from({ length: 5 }, () => cancelled('ADMIN_OVERRIDE', 'ADMIN')),
      ...Array.from({ length: 5 }, () => ride({ status: 'EXPIRED', cancellationReason: 'TIMEOUT_EXPIRED' })),
    ];
    const stats = computeTripStats('RIDER', rides, NOW);
    expect(stats.cancelledRides).toBe(35);
    expect(stats.responsibleCancellations).toBe(0);
    expect(stats.noShows).toBe(0);
  });

  it('charges driver-caused cancellations to the driver instead', () => {
    const rides = [cancelled('DRIVER_DELAYED', 'DRIVER'), cancelled('DRIVER_NO_SHOW', 'DRIVER')];
    const stats = computeTripStats('DRIVER', rides, NOW);
    expect(stats.responsibleCancellations).toBe(2);
    expect(stats.noShows).toBe(1);
  });

  it('counts a rider no-show for the rider, with the no-show also a cancellation', () => {
    const stats = computeTripStats('RIDER', [cancelled('RIDER_NO_SHOW', 'DRIVER')], NOW);
    expect(stats.responsibleCancellations).toBe(1);
    expect(stats.noShows).toBe(1);
  });

  it('ignores rider cancellations that happened before a driver was assigned', () => {
    const stats = computeTripStats(
      'RIDER',
      [cancelled('RIDER_CHANGED_MIND', 'RIDER', { driverId: null })],
      NOW,
    );
    expect(stats.responsibleCancellations).toBe(0);
  });

  it('uses the legacy reason when cancelledBy was never stored', () => {
    const legacy = cancelled('RIDER_CHANGED_MIND', null);
    expect(computeTripStats('RIDER', [legacy], NOW).responsibleCancellations).toBe(1);
    const ambiguous = cancelled('DRIVER_DELAYED', null);
    expect(computeTripStats('DRIVER', [ambiguous], NOW).responsibleCancellations).toBe(0);
  });

  it('keeps unpaid rides out of completed rides for riders only (F6)', () => {
    const rides = [ride({ status: 'SETTLED' }), ride({ status: 'PAYMENT_UNPAID' })];
    const rider = computeTripStats('RIDER', rides, NOW);
    expect(rider.completedRides).toBe(1);
    expect(rider.unpaidRides).toBe(1);
    const driver = computeTripStats('DRIVER', rides, NOW);
    expect(driver.completedRides).toBe(2);
    expect(driver.unpaidRides).toBe(0);
  });

  it('counts a dispute only against the party an admin ruled against, and keeps it after resolution', () => {
    const riderWon = ride({ disputeOutcome: 'RIDER_WINS', disputeResolvedAt: NOW });
    const driverWon = ride({ disputeOutcome: 'DRIVER_WINS', disputeResolvedAt: NOW });
    expect(computeTripStats('DRIVER', [riderWon], NOW).disputesAgainst).toBe(1);
    expect(computeTripStats('RIDER', [riderWon], NOW).disputesAgainst).toBe(0);
    expect(computeTripStats('RIDER', [driverWon], NOW).disputesAgainst).toBe(1);
    expect(computeTripStats('DRIVER', [driverWon], NOW).disputesAgainst).toBe(0);
  });

  it('does not score an unresolved dispute, but reports it', () => {
    const open = ride({ status: 'PAYMENT_DISPUTED' });
    const rider = computeTripStats('RIDER', [open], NOW);
    expect(rider.disputesAgainst).toBe(0);
    expect(rider.openDisputes).toBe(1);
    expect(rider.completedRides).toBe(1);
  });

  it('halves the weight of an event every 90 days (F9)', () => {
    expect(decayWeight(NOW, NOW)).toBe(1);
    expect(decayWeight(daysAgo(90), NOW)).toBeCloseTo(0.5, 5);
    expect(decayWeight(daysAgo(180), NOW)).toBeCloseTo(0.25, 5);
    const old = cancelled('RIDER_CHANGED_MIND', 'RIDER', { cancelledAt: daysAgo(90) });
    expect(computeTripStats('RIDER', [old], NOW).responsibleCancellations).toBe(0.5);
  });

  it('adds up fares for completed and unpaid rides', () => {
    const stats = computeTripStats('RIDER', [ride(), ride({ agreedFarePaise: null, suggestedFarePaise: 5_000 })], NOW);
    expect(stats.totalSpentPaise).toBe(15_000);
  });
});

describe('ride repository parity (F4)', () => {
  it('gives the same numbers for a rider whichever way they are looked up', async () => {
    const repo = new MemoryRideRepository();
    const base = {
      pickup: { lat: 0, lng: 0, address: null },
      drop: { lat: 0, lng: 0, address: null },
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const make = (id: string, over: object) =>
      ({
        id,
        bookerRiderId: 'rdr-1',
        passenger: { riderId: 'rdr-1', name: 'A', phoneE164: '+910000000000', pickupOtpHash: 'x' },
        driverId: 'drv-1',
        status: 'SETTLED',
        suggestedFarePaise: 10_000,
        agreedFarePaise: 10_000,
        ...base,
        ...over,
      }) as never;
    await repo.save(make('r1', {}));
    await repo.save(make('r2', { bookerRiderId: 'rdr-2', passenger: { riderId: 'rdr-1', name: 'A', phoneE164: '+910000000000', pickupOtpHash: 'x' } }));

    const single = (await repo.getTripStats('RIDER', ['rdr-1'], NOW)).get('rdr-1')!;
    const batch = (await repo.getTripStats('RIDER', ['rdr-1', 'rdr-2'], NOW)).get('rdr-1')!;
    expect(single).toEqual(batch);
    // the account holder who booked is responsible: the ride booked by rdr-2 is not rdr-1's
    expect(single.totalRides).toBe(1);
  });

  it('calls the trust hook only for rides in a scoring state', async () => {
    const repo = new MemoryRideRepository();
    const seen: string[] = [];
    repo.onTerminalTransition = (r) => seen.push(r.status);
    const base = {
      id: 'r1',
      bookerRiderId: 'rdr-1',
      passenger: { riderId: 'rdr-1', name: 'A', phoneE164: '+910000000000', pickupOtpHash: 'x' },
      driverId: 'drv-1',
      suggestedFarePaise: 1,
      agreedFarePaise: 1,
      pickup: { lat: 0, lng: 0, address: null },
      drop: { lat: 0, lng: 0, address: null },
      createdAt: NOW,
      updatedAt: NOW,
    };
    await repo.save({ ...base, status: 'ACCEPTED', version: 1 } as never);
    await repo.update({ ...base, status: 'EN_ROUTE_TO_PICKUP' as RideStatus, version: 2 } as never, 1);
    await repo.update({ ...base, status: 'CANCELLED', version: 3 } as never, 2);
    expect(seen).toEqual(['CANCELLED']);
  });
});

describe('TrustScoreService', () => {
  const profile = (id: string, over: object = {}) =>
    ({ id, userId: `u-${id}`, ratingAverage: null, ratingCount: 0, ratingSum: 0, ...over }) as unknown as RiderEntity & DriverEntity;

  function setup(mode: 'off' | 'shadow' | 'on', rides: TripStatsRide[]) {
    const saved: Array<{ id: string; trust: TrustSnapshot }> = [];
    const riders = new Map([['rdr-1', profile('rdr-1')]]);
    const riderRepo = {
      findById: async (id: string) => riders.get(id) ?? null,
      findManyByIds: async (ids: string[]) => ids.map((i) => riders.get(i)!).filter(Boolean),
      saveTrust: async (id: string, trust: TrustSnapshot) => {
        saved.push({ id, trust });
        const p = riders.get(id)!;
        Object.assign(p, { trustBreakdown: trust.breakdown, trustTier: trust.tier });
      },
      listIds: async (after: string | null) => (after ? [] : ['rdr-1']),
    };
    const rideRepo = {
      getTripStats: async (role: 'RIDER' | 'DRIVER', ids: string[], now: Date) =>
        new Map(ids.map((id) => [id, computeTripStats(role, rides, now)])),
    };
    const service = new TrustScoreService({
      riderRepo: riderRepo as never,
      driverRepo: {} as never,
      rideRepo: rideRepo as never,
      mode,
      now: () => NOW,
      debounceMs: 50,
    });
    return { service, saved };
  }

  const fiveRides = Array.from({ length: 5 }, () => ride());

  it('stores the new score when mode is on, and the old one otherwise', async () => {
    const on = setup('on', fiveRides);
    await on.service.refresh('RIDER', 'rdr-1');
    expect(on.saved[0]!.trust.score).toBe(89); // v2: provisional cap

    const shadow = setup('shadow', fiveRides);
    await shadow.service.refresh('RIDER', 'rdr-1');
    expect(shadow.saved[0]!.trust.score).toBe(100); // v1 stays authoritative
  });

  it('is idempotent: refreshing again gives the same stored result', async () => {
    const { service, saved } = setup('on', fiveRides);
    await service.refresh('RIDER', 'rdr-1');
    await service.refresh('RIDER', 'rdr-1');
    await service.refresh('RIDER', 'rdr-1');
    expect(new Set(saved.map((s) => s.trust.score)).size).toBe(1);
  });

  it('refreshAll walks every profile', async () => {
    const { service, saved } = setup('on', fiveRides);
    const count = await service.refreshAll({ roles: ['RIDER'] });
    expect(count).toBe(1);
    expect(saved).toHaveLength(1);
  });

  it('exposes only the tier, and only when the score is public (F11)', async () => {
    const hidden = setup('on', [ride()]); // 1 completed ride
    await hidden.service.refresh('RIDER', 'rdr-1');
    expect((await hidden.service.getPublicTiers('RIDER', ['rdr-1'])).size).toBe(0);

    const visible = setup('on', fiveRides);
    await visible.service.refresh('RIDER', 'rdr-1');
    const tiers = await visible.service.getPublicTiers('RIDER', ['rdr-1']);
    expect(tiers.get('rdr-1')).toEqual({ tier: 'GOOD' });
  });

  describe('schedule', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('collapses a burst of triggers into one refresh', async () => {
      const { service, saved } = setup('on', fiveRides);
      service.schedule('RIDER', 'rdr-1');
      service.schedule('RIDER', 'rdr-1');
      service.schedule('RIDER', 'rdr-1');
      await vi.advanceTimersByTimeAsync(200);
      expect(saved).toHaveLength(1);
    });
  });
});
