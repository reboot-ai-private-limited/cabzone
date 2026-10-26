import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ACTIVE_RIDE_STATUSES, RIDE_STATUSES, type RideStatus } from '@cabzone/contracts';
import {
  CreateQuoteUseCase,
  MemoryPricingConfigRepository,
  type PricingConfigEntity,
} from '../../src/modules/pricing/index.js';
import {
  CreateRideUseCase,
  MongoRideEventRepository,
  MongoRideRepository,
  RideEventModel,
  RideModel,
} from '../../src/modules/rides/index.js';
import {
  MemoryZoneRepository,
  ResolveZonesUseCase,
  ServiceClassificationUseCase,
  type ZoneEntity,
} from '../../src/modules/zone/index.js';
import { MongoUnitOfWork } from '../../src/shared/db/unitOfWork.js';
import { AppError } from '../../src/shared/errors/AppError.js';

const QUOTE_SECRET = 'test-token-secret-for-quote-signature-32';
const RIDER_ID = '018f0a00-0000-7000-8000-000000000201';
const OTHER_RIDER_ID = '018f0a00-0000-7000-8000-000000000202';

const siliguriZone: ZoneEntity = {
  id: '018f0a00-0000-7000-8000-000000000001',
  name: 'Siliguri City',
  zoneType: 'CITY',
  parentCityZoneId: null,
  stateCode: 'WB',
  boundary: {
    type: 'Polygon',
    coordinates: [
      [
        [88.4, 26.7],
        [88.5, 26.7],
        [88.5, 26.8],
        [88.4, 26.8],
        [88.4, 26.7],
      ],
    ],
  },
  bufferDistanceM: 25_000,
  status: 'ACTIVE',
  currentPricingConfigId: '018f0a00-0000-7000-8000-000000000010',
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const basePricingConfig: PricingConfigEntity = {
  id: '018f0a00-0000-7000-8000-000000000010',
  level: 'CITY',
  cityZoneId: siliguriZone.id,
  stateCode: 'WB',
  version: 1,
  vehicleType: 'CAB',
  baseFarePaise: 5000,
  ratePerKmPaise: 1500,
  minimumFarePaise: 8000,
  outstationBaseFarePaise: 7500,
  outstationRatePerKmPaise: 2000,
  outstationMinimumFarePaise: 15000,
  bufferSurchargePaise: 2000,
  negotiationFloorPercent: 80,
  negotiationCeilingPercent: 150,
  negotiationWindowSeconds: 90,
  commissionPercent: 8,
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: null,
  status: 'ACTIVE',
  createdByAdminId: '018f0a00-0000-7000-8000-000000000099',
  createdAt: new Date(),
};

describe('Mongo one-active-rider-booking concurrency & status matrix (D-043)', () => {
  let replSet: MongoMemoryReplSet;
  let rideRepo: MongoRideRepository;
  let rideEventRepo: MongoRideEventRepository;
  let pricingConfigRepo: MemoryPricingConfigRepository;
  let quoteUseCase: CreateQuoteUseCase;
  let createRideUseCase: CreateRideUseCase;

  beforeAll(async () => {
    const candidatePaths = [
      process.env.MONGOMS_SYSTEM_BINARY,
      'O:/rebootAI/cabzonenew/node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe',
      resolve(
        process.cwd(),
        '../../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe',
      ),
      resolve(
        process.cwd(),
        'node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe',
      ),
      'C:/Users/zxprg/.cache/mongodb-binaries/mongod-x64-win32-8.2.6.exe',
    ].filter(Boolean) as string[];
    const systemBinary = candidatePaths.find((p) => existsSync(p));
    replSet = await MongoMemoryReplSet.create({
      ...(systemBinary ? { binary: { systemBinary } } : {}),
      replSet: { count: 1, name: 'rs0' },
    });
    await mongoose.connect(replSet.getUri());
    await Promise.all([RideModel.init(), RideEventModel.init()]);
  });

  beforeEach(async () => {
    await Promise.all([RideModel.deleteMany({}), RideEventModel.deleteMany({})]);
    const zoneRepo = new MemoryZoneRepository();
    zoneRepo.save(siliguriZone);
    pricingConfigRepo = new MemoryPricingConfigRepository();
    pricingConfigRepo.save(basePricingConfig);
    quoteUseCase = new CreateQuoteUseCase({
      serviceClassificationUseCase: new ServiceClassificationUseCase({
        resolveZonesUseCase: new ResolveZonesUseCase({ zoneRepo }),
      }),
      pricingConfigRepo,
      tokenSecret: QUOTE_SECRET,
      quoteTtlSeconds: 300,
    });
    rideRepo = new MongoRideRepository();
    rideEventRepo = new MongoRideEventRepository();
    createRideUseCase = new CreateRideUseCase({
      unitOfWork: new MongoUnitOfWork(),
      rideRepo,
      rideEventRepo,
      pricingConfigRepo,
      tokenSecret: QUOTE_SECRET,
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  });

  async function buildRideInput(
    riderId = RIDER_ID,
    overrides?: { dropLat?: number; idempotencyKey?: string },
  ) {
    const pickup = { lat: 26.71, lng: 88.42, address: 'Sevoke Road' };
    const drop = { lat: overrides?.dropLat ?? 26.75, lng: 88.45, address: 'Hill Cart Road' };
    const quote = await quoteUseCase.execute({
      pickup: { lat: pickup.lat, lng: pickup.lng },
      drop: { lat: drop.lat, lng: drop.lng },
      vehicleCategory: 'CAB',
      distanceM: 6000,
      durationSeconds: 900,
    });
    return {
      quoteToken: quote.quoteToken,
      proposedFarePaise: quote.suggestedFarePaise,
      riderId,
      passengerName: 'Priya Mukherjee',
      passengerPhoneE164: '+919000000003',
      pickup,
      drop,
      vehicleCategory: 'CAB' as const,
      ...(overrides?.idempotencyKey ? { idempotencyKey: overrides.idempotencyKey } : {}),
    };
  }

  it('allows only one active booking when the same rider fires simultaneous distinct requests', async () => {
    const inputs = await Promise.all([
      buildRideInput(RIDER_ID, { dropLat: 26.751, idempotencyKey: 'attempt-alpha-01' }),
      buildRideInput(RIDER_ID, { dropLat: 26.752, idempotencyKey: 'attempt-alpha-02' }),
      buildRideInput(RIDER_ID, { dropLat: 26.753, idempotencyKey: 'attempt-alpha-03' }),
      buildRideInput(RIDER_ID, { dropLat: 26.754, idempotencyKey: 'attempt-alpha-04' }),
      buildRideInput(RIDER_ID, { dropLat: 26.755 }),
    ]);
    const otherRiderInput = await buildRideInput(OTHER_RIDER_ID, {
      idempotencyKey: 'other-rider-01',
    });

    const [otherResult, ...sameRiderResults] = await Promise.allSettled([
      createRideUseCase.execute(otherRiderInput),
      ...inputs.map((input) => createRideUseCase.execute(input)),
    ]);

    expect(otherResult.status).toBe('fulfilled');

    const fulfilled = sameRiderResults.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<CreateRideUseCase['execute']>>> =>
        r.status === 'fulfilled',
    );
    const rejected = sameRiderResults.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(4);

    const winner = fulfilled[0]!.value;
    expect(winner.status).toBe('OFFERING');

    for (const failure of rejected) {
      expect(failure.reason).toBeInstanceOf(AppError);
      const err = failure.reason as AppError;
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('CONFLICT');
      expect(err.message).toContain('ACTIVE_RIDE_EXISTS');
      expect(err.publicDetails).toEqual({
        code: 'ACTIVE_RIDE_EXISTS',
        rideId: winner.id,
        status: 'OFFERING',
        ridePath: `/api/v1/rides/${winner.id}`,
      });
    }

    expect(await RideModel.countDocuments({ booker_rider_id: RIDER_ID })).toBe(1);
    expect(await RideEventModel.countDocuments({ ride_id: winner.id })).toBe(1);
  });

  it('deduplicates simultaneous retries sharing an idempotencyKey and guards parameter reuse', async () => {
    const input = await buildRideInput(RIDER_ID, { idempotencyKey: 'retry-same-request-01' });

    const attempts = await Promise.all([
      createRideUseCase.executeWithMeta(input),
      createRideUseCase.executeWithMeta(input),
      createRideUseCase.executeWithMeta(input),
      createRideUseCase.executeWithMeta(input),
    ]);

    const uniqueIds = new Set(attempts.map((a) => a.ride.id));
    expect(uniqueIds.size).toBe(1);
    expect(attempts.filter((a) => !a.replayed)).toHaveLength(1);
    expect(attempts.filter((a) => a.replayed)).toHaveLength(3);

    const createdId = attempts[0]!.ride.id;
    expect(await RideModel.countDocuments({ booker_rider_id: RIDER_ID })).toBe(1);
    expect(await RideEventModel.countDocuments({ ride_id: createdId })).toBe(1);

    // Replay remains idempotent even after pricing config bumps to version 2
    await pricingConfigRepo.save({ ...basePricingConfig, version: 2 });
    const postBumpReplay = await createRideUseCase.executeWithMeta(input);
    expect(postBumpReplay.replayed).toBe(true);
    expect(postBumpReplay.ride.id).toBe(createdId);

    // Reusing the same idempotencyKey with different ride parameters fails with 409
    await expect(
      createRideUseCase.executeWithMeta({
        ...input,
        proposedFarePaise: input.proposedFarePaise + 500,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      publicDetails: { code: 'IDEMPOTENCY_KEY_REUSED' },
    });
  });

  it('blocks new bookings across all 9 active statuses and allows them across all 4 non-blocking statuses', async () => {
    const nonBlockingStatuses = RIDE_STATUSES.filter(
      (s): s is RideStatus => !ACTIVE_RIDE_STATUSES.includes(s as (typeof ACTIVE_RIDE_STATUSES)[number]),
    );
    expect(ACTIVE_RIDE_STATUSES).toHaveLength(9);
    expect(nonBlockingStatuses).toEqual(['PAYMENT_DISPUTED', 'SETTLED', 'CANCELLED', 'EXPIRED']);

    const initial = await createRideUseCase.execute(await buildRideInput(RIDER_ID));

    for (const blockingStatus of ACTIVE_RIDE_STATUSES) {
      await RideModel.updateOne({ _id: initial.id }, { $set: { status: blockingStatus } }).exec();

      await expect(createRideUseCase.execute(await buildRideInput(RIDER_ID))).rejects.toMatchObject(
        {
          statusCode: 409,
          publicDetails: {
            code: 'ACTIVE_RIDE_EXISTS',
            rideId: initial.id,
            status: blockingStatus,
            ridePath: `/api/v1/rides/${initial.id}`,
          },
        },
      );
    }

    let currentRideId = initial.id;
    for (const nonBlockingStatus of nonBlockingStatuses) {
      await RideModel.updateOne(
        { _id: currentRideId },
        { $set: { status: nonBlockingStatus } },
      ).exec();

      const nextRide = await createRideUseCase.execute(await buildRideInput(RIDER_ID));
      expect(nextRide.id).not.toBe(currentRideId);
      expect(nextRide.status).toBe('OFFERING');
      currentRideId = nextRide.id;
    }
  });
});
