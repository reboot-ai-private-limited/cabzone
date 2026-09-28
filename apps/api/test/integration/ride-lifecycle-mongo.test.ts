import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import {
  AcceptRideUseCase,
  CancelRideUseCase,
  CompleteRideUseCase,
  CreateRideUseCase,
  DriverArrivedUseCase,
  DriverEnRouteUseCase,
  MongoRideEventRepository,
  MongoRideRepository,
  RideEventModel,
  RideModel,
  StartRideUseCase,
  type RideEntity,
} from '../../src/modules/rides/index.js';
import {
  MemoryWalletRepository,
  type WalletEntity,
} from '../../src/modules/ledger/index.js';
import {
  CreateQuoteUseCase,
  MemoryPricingConfigRepository,
  type PricingConfigEntity,
} from '../../src/modules/pricing/index.js';
import {
  MemoryZoneRepository,
  ResolveZonesUseCase,
  ServiceClassificationUseCase,
  type ZoneEntity,
} from '../../src/modules/zone/index.js';
import { AppError } from '../../src/shared/errors/AppError.js';

describe('MongoDB Atomic Claim & Lifecycle Integration Test (rs0 Replica Set)', () => {
  let replSet: MongoMemoryReplSet;
  let mongoRideRepo: MongoRideRepository;
  let mongoRideEventRepo: MongoRideEventRepository;
  let walletRepo: MemoryWalletRepository;
  let pricingConfigRepo: MemoryPricingConfigRepository;
  let zoneRepo: MemoryZoneRepository;
  let resolveZonesUseCase: ResolveZonesUseCase;
  let serviceClassificationUseCase: ServiceClassificationUseCase;
  let quoteUseCase: CreateQuoteUseCase;
  let createRideUseCase: CreateRideUseCase;
  let acceptRideUseCase: AcceptRideUseCase;
  let driverEnRouteUseCase: DriverEnRouteUseCase;
  let driverArrivedUseCase: DriverArrivedUseCase;
  let startRideUseCase: StartRideUseCase;
  let completeRideUseCase: CompleteRideUseCase;
  let cancelRideUseCase: CancelRideUseCase;

  const TEST_SECRET = 'test-token-secret-for-quote-signature-32';
  const DRIVER_ID_1 = '018f0a00-0000-7000-8000-000000000101';
  const DRIVER_ID_2 = '018f0a00-0000-7000-8000-000000000102';
  const RIDER_ID = '018f0a00-0000-7000-8000-000000000201';

  const siliguriCityZone: ZoneEntity = {
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

  const cabPricingConfig: PricingConfigEntity = {
    id: '018f0a00-0000-7000-8000-000000000010',
    cityZoneId: siliguriCityZone.id,
    version: 1,
    vehicleType: 'CAB',
    baseFarePaise: 5000,
    ratePerKmPaise: 1500,
    minimumFarePaise: 8000,
    includedDistanceM: 2000,
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

  const driver1Wallet: WalletEntity = {
    id: '018f0a00-0000-7000-8000-000000000301',
    driverId: DRIVER_ID_1,
    balancePaise: 250000,
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const driver2Wallet: WalletEntity = {
    id: '018f0a00-0000-7000-8000-000000000302',
    driverId: DRIVER_ID_2,
    balancePaise: 150000,
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    const candidatePaths = [
      process.env.MONGOMS_SYSTEM_BINARY,
      resolve(process.cwd(), '../../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe'),
      resolve(process.cwd(), 'node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe'),
      'C:/Users/zxprg/.cache/mongodb-binaries/mongod-x64-win32-8.2.6.exe',
    ].filter(Boolean) as string[];

    const systemBinary = candidatePaths.find((p) => existsSync(p));

    replSet = await MongoMemoryReplSet.create({
      ...(systemBinary ? { binary: { systemBinary } } : {}),
      replSet: { count: 1, name: 'rs0' },
    });
    const uri = replSet.getUri();
    await mongoose.connect(uri);

    mongoRideRepo = new MongoRideRepository();
    mongoRideEventRepo = new MongoRideEventRepository();
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) {
      await replSet.stop();
    }
  }, 60000);

  beforeEach(async () => {
    await RideModel.deleteMany({});
    await RideEventModel.deleteMany({});

    walletRepo = new MemoryWalletRepository();
    walletRepo.save(driver1Wallet);
    walletRepo.save(driver2Wallet);

    zoneRepo = new MemoryZoneRepository();
    zoneRepo.save(siliguriCityZone);

    resolveZonesUseCase = new ResolveZonesUseCase({ zoneRepo });
    serviceClassificationUseCase = new ServiceClassificationUseCase({
      resolveZonesUseCase,
    });

    pricingConfigRepo = new MemoryPricingConfigRepository();
    pricingConfigRepo.save(cabPricingConfig);

    quoteUseCase = new CreateQuoteUseCase({
      serviceClassificationUseCase,
      pricingConfigRepo,
      tokenSecret: TEST_SECRET,
      quoteTtlSeconds: 300,
    });

    createRideUseCase = new CreateRideUseCase({
      rideRepo: mongoRideRepo,
      pricingConfigRepo,
      tokenSecret: TEST_SECRET,
    });

    acceptRideUseCase = new AcceptRideUseCase({
      rideRepo: mongoRideRepo,
      walletRepo,
      otpTtlMinutes: 20,
    });

    driverEnRouteUseCase = new DriverEnRouteUseCase({
      rideRepo: mongoRideRepo,
      rideEventRepo: mongoRideEventRepo,
    });

    driverArrivedUseCase = new DriverArrivedUseCase({
      rideRepo: mongoRideRepo,
      rideEventRepo: mongoRideEventRepo,
    });

    startRideUseCase = new StartRideUseCase({
      rideRepo: mongoRideRepo,
    });

    completeRideUseCase = new CompleteRideUseCase({
      rideRepo: mongoRideRepo,
      walletRepo,
      rideEventRepo: mongoRideEventRepo,
    });

    cancelRideUseCase = new CancelRideUseCase({
      rideRepo: mongoRideRepo,
      walletRepo,
      rideEventRepo: mongoRideEventRepo,
    });
  });

  async function createInitialRide(): Promise<RideEntity> {
    const pickup = { lat: 26.71, lng: 88.42, address: 'Hill Cart Road' };
    const drop = { lat: 26.75, lng: 88.45, address: 'Sevoke Road' };

    const quote = await quoteUseCase.execute({
      pickup,
      drop,
      vehicleCategory: 'CAB',
    });

    return createRideUseCase.execute({
      quoteToken: quote.quoteToken,
      proposedFarePaise: quote.suggestedFarePaise,
      riderId: RIDER_ID,
      passengerName: 'Subir Roy',
      passengerPhoneE164: '+919876543210',
      pickup,
      drop,
      vehicleCategory: 'CAB',
    });
  }

  describe('Full End-to-End Lifecycle Persistence with Real MongoDB', () => {
    it('executes Quote -> Create Ride -> Atomic Driver Claim -> Arrive -> OTP Start -> Complete -> Settle against real MongoDB', async () => {
      // 1. Quote & Create Ride in MongoDB
      const createdRide = await createInitialRide();
      expect(createdRide.status).toBe('OFFERING');
      expect(createdRide.driverId).toBeNull();
      expect(createdRide.version).toBe(1);

      // Verify direct MongoDB document creation
      const mongoDocAfterCreate = await RideModel.findById(createdRide.id).lean();
      expect(mongoDocAfterCreate).not.toBeNull();
      expect(mongoDocAfterCreate?.booker_rider_id).toBe(RIDER_ID);
      expect(mongoDocAfterCreate?.status).toBe('OFFERING');
      expect(mongoDocAfterCreate?.driver_id).toBeNull();
      expect(mongoDocAfterCreate?.passenger.name).toBe('Subir Roy');
      expect(mongoDocAfterCreate?.version).toBe(1);

      // 2. Atomic Driver Claim
      const claimResult = await acceptRideUseCase.execute({
        rideId: createdRide.id,
        driverId: DRIVER_ID_1,
      });

      expect(claimResult.ride.status).toBe('DRIVER_ASSIGNED');
      expect(claimResult.ride.driverId).toBe(DRIVER_ID_1);
      expect(claimResult.ride.version).toBe(2);
      expect(claimResult._riderPickupOtp).toBeDefined();
      expect(claimResult._riderPickupOtp).toMatch(/^\d{4}$/);

      // Verify MongoDB atomic update outcome
      const mongoDocAfterClaim = await RideModel.findById(createdRide.id).lean();
      expect(mongoDocAfterClaim?.status).toBe('DRIVER_ASSIGNED');
      expect(mongoDocAfterClaim?.driver_id).toBe(DRIVER_ID_1);
      expect(mongoDocAfterClaim?.version).toBe(2);
      expect(mongoDocAfterClaim?.accepted_at).toBeInstanceOf(Date);
      expect(mongoDocAfterClaim?.passenger.pickup_otp_hash).toBeDefined();
      expect(mongoDocAfterClaim?.passenger.pickup_otp_expires_at).toBeInstanceOf(Date);
      expect(mongoDocAfterClaim?.passenger.otp_attempts).toBe(0);

      // 3. Driver En-Route Progression
      const enRouteRide = await driverEnRouteUseCase.execute({
        rideId: createdRide.id,
        driverId: DRIVER_ID_1,
      });
      expect(enRouteRide.status).toBe('DRIVER_EN_ROUTE');
      expect(enRouteRide.version).toBe(3);

      const mongoDocAfterEnRoute = await RideModel.findById(createdRide.id).lean();
      expect(mongoDocAfterEnRoute?.status).toBe('DRIVER_EN_ROUTE');
      expect(mongoDocAfterEnRoute?.version).toBe(3);

      // 4. Curbside Arrival Gatekeeper
      const arrivedAt = new Date();
      const arrivedRide = await driverArrivedUseCase.execute({
        rideId: createdRide.id,
        driverId: DRIVER_ID_1,
        arrivedAt,
      });
      expect(arrivedRide.status).toBe('DRIVER_ARRIVED');
      expect(arrivedRide.arrivedAt).toEqual(arrivedAt);
      expect(arrivedRide.version).toBe(4);

      const mongoDocAfterArrived = await RideModel.findById(createdRide.id).lean();
      expect(mongoDocAfterArrived?.status).toBe('DRIVER_ARRIVED');
      expect(mongoDocAfterArrived?.arrived_at).toEqual(arrivedAt);
      expect(mongoDocAfterArrived?.version).toBe(4);

      // 5. Curbside OTP Verification & Trip Start
      const startedRide = await startRideUseCase.execute({
        rideId: createdRide.id,
        driverId: DRIVER_ID_1,
        otp: claimResult._riderPickupOtp!,
      });
      expect(startedRide.status).toBe('TRIP_STARTED');
      expect(startedRide.startedAt).toBeInstanceOf(Date);
      expect(startedRide.version).toBe(5);

      const mongoDocAfterStarted = await RideModel.findById(createdRide.id).lean();
      expect(mongoDocAfterStarted?.status).toBe('TRIP_STARTED');
      expect(mongoDocAfterStarted?.started_at).toBeInstanceOf(Date);
      expect(mongoDocAfterStarted?.version).toBe(5);

      // 6. Trip Completion & 8% Commission Settlement
      const completedAt = new Date();
      const completeResult = await completeRideUseCase.execute({
        rideId: createdRide.id,
        driverId: DRIVER_ID_1,
        completedAt,
      });

      expect(completeResult.ride.status).toBe('SETTLED');
      expect(completeResult.ride.completedAt).toEqual(completedAt);
      expect(completeResult.ride.settledAt).toEqual(completedAt);
      expect(completeResult.ride.version).toBe(6);

      // 8% commission on 11000 paise (suggested fare for 6km) = Math.round(11000 * 0.08) = 880 paise
      expect(completeResult.commissionPaise).toBe(
        Math.round((completeResult.farePaise * 8) / 100),
      );
      expect(completeResult.driverWallet.balancePaise).toBe(
        driver1Wallet.balancePaise - completeResult.commissionPaise,
      );

      // 7. Verify Final MongoDB State & Audit Trail
      const finalMongoDoc = await RideModel.findById(createdRide.id).lean();
      expect(finalMongoDoc?.status).toBe('SETTLED');
      expect(finalMongoDoc?.completed_at).toEqual(completedAt);
      expect(finalMongoDoc?.settled_at).toEqual(completedAt);
      expect(finalMongoDoc?.version).toBe(6);

      // Verify immutable events stored in MongoDB ride_events collection
      const eventsInMongo = await RideEventModel.find({ ride_id: createdRide.id })
        .sort({ created_at: 1, _id: 1 })
        .lean();

      expect(eventsInMongo.length).toBe(4);
      const eventTypes = eventsInMongo.map((e) => e.event_type);
      expect(eventTypes).toEqual(
        expect.arrayContaining([
          'DRIVER_EN_ROUTE',
          'DRIVER_ARRIVED',
          'TRIP_COMPLETED',
          'RIDE_SETTLED',
        ]),
      );

      const enRouteEvent = eventsInMongo.find((e) => e.event_type === 'DRIVER_EN_ROUTE');
      expect(enRouteEvent?.actor_type).toBe('DRIVER');
      expect(enRouteEvent?.actor_id).toBe(DRIVER_ID_1);

      const arrivedEvent = eventsInMongo.find((e) => e.event_type === 'DRIVER_ARRIVED');
      expect(arrivedEvent?.actor_type).toBe('DRIVER');
      expect(arrivedEvent?.actor_id).toBe(DRIVER_ID_1);

      const completedEvent = eventsInMongo.find((e) => e.event_type === 'TRIP_COMPLETED');
      expect(completedEvent?.actor_type).toBe('DRIVER');
      expect(completedEvent?.actor_id).toBe(DRIVER_ID_1);

      const settledEvent = eventsInMongo.find((e) => e.event_type === 'RIDE_SETTLED');
      expect(settledEvent?.actor_type).toBe('SYSTEM');
    });
  });

  describe('Real Database Concurrency & Race Condition', () => {
    it('handles two simultaneous driver claims: exactly one succeeds, the other receives 409 RIDE_ALREADY_ASSIGNED', async () => {
      const ride = await createInitialRide();

      // Verify initial state in MongoDB
      const initialDoc = await RideModel.findById(ride.id).lean();
      expect(initialDoc?.status).toBe('OFFERING');
      expect(initialDoc?.driver_id).toBeNull();
      expect(initialDoc?.version).toBe(1);

      // Two drivers concurrently try to accept the exact same ride
      const [res1, res2] = await Promise.allSettled([
        acceptRideUseCase.execute({ rideId: ride.id, driverId: DRIVER_ID_1 }),
        acceptRideUseCase.execute({ rideId: ride.id, driverId: DRIVER_ID_2 }),
      ]);

      const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
      const rejected = [res1, res2].filter((r) => r.status === 'rejected');

      // Exactly one must succeed, exactly one must fail
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // The rejected one must be 409 Conflict with RIDE_ALREADY_ASSIGNED
      const error = (rejected[0] as PromiseRejectedResult).reason as AppError;
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(409);
      expect(error.message).toContain('RIDE_ALREADY_ASSIGNED');

      // Verify MongoDB document state in replica set
      const finalDoc = await RideModel.findById(ride.id).lean();
      expect(finalDoc?.status).toBe('DRIVER_ASSIGNED');
      expect([DRIVER_ID_1, DRIVER_ID_2]).toContain(finalDoc?.driver_id);
      // Version must have incremented exactly once (from 1 to 2)
      expect(finalDoc?.version).toBe(2);

      // The fulfilled result must match the driver recorded in MongoDB
      const winningDriver = (fulfilled[0] as PromiseFulfilledResult<{ ride: RideEntity }>).value.ride.driverId;
      expect(finalDoc?.driver_id).toBe(winningDriver);
    });

    it('rejects claim if atomicClaimRide is attempted on an already claimed ride', async () => {
      const ride = await createInitialRide();

      // First claim succeeds
      const claimed1 = await mongoRideRepo.atomicClaimRide({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
        agreedFarePaise: 11000,
        pickupOtpHash: 'hash1',
        pickupOtpExpiresAt: new Date(Date.now() + 1200000),
      });
      expect(claimed1).not.toBeNull();
      expect(claimed1?.driverId).toBe(DRIVER_ID_1);

      // Second claim returns null
      const claimed2 = await mongoRideRepo.atomicClaimRide({
        rideId: ride.id,
        driverId: DRIVER_ID_2,
        agreedFarePaise: 11000,
        pickupOtpHash: 'hash2',
        pickupOtpExpiresAt: new Date(Date.now() + 1200000),
      });
      expect(claimed2).toBeNull();
    });

    it('rejects claim on a non-existent ride', async () => {
      const claimed = await mongoRideRepo.atomicClaimRide({
        rideId: '018f0a00-0000-7000-8000-999999999999',
        driverId: DRIVER_ID_1,
        agreedFarePaise: 11000,
        pickupOtpHash: 'hash1',
        pickupOtpExpiresAt: new Date(Date.now() + 1200000),
      });
      expect(claimed).toBeNull();
    });
  });

  describe('Daily Rider Unassigned Cancellations Count (MongoDB Query)', () => {
    it('correctly counts daily unassigned rider cancellations using countDailyRiderUnassignedCancellations', async () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000);
      const sinceDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24h window

      // Ride 1: Rider unassigned cancelled 2h ago -> COUNT
      const ride1 = await createInitialRide();
      ride1.status = 'CANCELLED';
      ride1.driverId = null;
      ride1.cancelledAt = twoHoursAgo;
      await mongoRideRepo.save(ride1);

      // Ride 2: Rider unassigned cancelled 5h ago -> COUNT
      const ride2 = await createInitialRide();
      ride2.status = 'CANCELLED';
      ride2.driverId = null;
      ride2.cancelledAt = fiveHoursAgo;
      await mongoRideRepo.save(ride2);

      // Ride 3: Rider cancelled WITH assigned driver -> DO NOT COUNT (assigned)
      const ride3 = await createInitialRide();
      ride3.status = 'CANCELLED';
      ride3.driverId = DRIVER_ID_1;
      ride3.cancelledAt = twoHoursAgo;
      await mongoRideRepo.save(ride3);

      // Ride 4: Active completed ride -> DO NOT COUNT
      const ride4 = await createInitialRide();
      ride4.status = 'SETTLED';
      await mongoRideRepo.save(ride4);

      // Ride 5: Unassigned cancelled 3 days ago (outside window) -> DO NOT COUNT
      const ride5 = await createInitialRide();
      ride5.status = 'CANCELLED';
      ride5.driverId = null;
      ride5.cancelledAt = threeDaysAgo;
      await mongoRideRepo.save(ride5);

      // Ride 6: Other rider unassigned cancelled -> DO NOT COUNT for RIDER_ID
      const ride6 = await createInitialRide();
      ride6.bookerRiderId = '018f0a00-0000-7000-8000-000000000999';
      ride6.passenger.riderId = '018f0a00-0000-7000-8000-000000000999';
      ride6.status = 'CANCELLED';
      ride6.driverId = null;
      ride6.cancelledAt = twoHoursAgo;
      await mongoRideRepo.save(ride6);

      const count = await mongoRideRepo.countDailyRiderUnassignedCancellations(
        RIDER_ID,
        sinceDate,
      );

      expect(count).toBe(2);
    });
  });

  describe('Cancellation Lifecycle & Persistence', () => {
    it('cancels a ride and records cancellation fee and event in MongoDB', async () => {
      const createdRide = await createInitialRide();
      const acceptResult = await acceptRideUseCase.execute({
        rideId: createdRide.id,
        driverId: DRIVER_ID_1,
      });

      // Rider cancels after 3 minutes (past 2-minute grace period) -> ₹50 fee, ₹35 driver credit
      const threeMinLater = new Date(acceptResult.ride.acceptedAt!.getTime() + 180000);
      const cancelResult = await cancelRideUseCase.execute({
        rideId: createdRide.id,
        actorType: 'RIDER',
        actorId: RIDER_ID,
        reason: 'RIDER_CHANGED_MIND',
        cancelledAt: threeMinLater,
      });

      expect(cancelResult.ride.status).toBe('CANCELLED');
      expect(cancelResult.feeBreakdown.totalFeePaise).toBe(5000);
      expect(cancelResult.feeBreakdown.driverCompensationPaise).toBe(3500);

      // Verify MongoDB document state
      const mongoDoc = await RideModel.findById(createdRide.id).lean();
      expect(mongoDoc?.status).toBe('CANCELLED');
      expect(mongoDoc?.cancellation_reason).toBe('RIDER_CHANGED_MIND');
      expect(mongoDoc?.cancelled_at).toEqual(threeMinLater);

      // Verify RIDE_CANCELLED event in MongoDB
      const cancelEvent = await RideEventModel.findOne({
        ride_id: createdRide.id,
        event_type: 'RIDE_CANCELLED',
      }).lean();
      expect(cancelEvent).not.toBeNull();
      expect(cancelEvent?.actor_type).toBe('RIDER');
      expect(cancelEvent?.actor_id).toBe(RIDER_ID);
    });
  });
});
