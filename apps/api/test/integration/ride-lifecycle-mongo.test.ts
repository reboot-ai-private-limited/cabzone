import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
  MongoWalletRepository,
  WalletModel,
  WalletTransactionModel,
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
import { MongoUnitOfWork } from '../../src/shared/db/unitOfWork.js';
import { AdminAdjustWalletUseCase } from '../../src/modules/ledger/application/useCases/adminAdjustWallet.usecase.js';
import { ExpireOffersUseCase } from '../../src/modules/rides/application/useCases/expireOffers.usecase.js';

describe('MongoDB Atomic Claim & Lifecycle Integration Test (rs0 Replica Set)', () => {
  let replSet: MongoMemoryReplSet;
  let mongoRideRepo: MongoRideRepository;
  let mongoRideEventRepo: MongoRideEventRepository;
  let walletRepo: MongoWalletRepository;
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
    const uri = replSet.getUri();
    await mongoose.connect(uri);
    await Promise.all([
      RideModel.init(),
      RideEventModel.init(),
      WalletModel.init(),
      WalletTransactionModel.init(),
    ]);

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
    await WalletModel.deleteMany({});
    await WalletTransactionModel.deleteMany({});

    walletRepo = new MongoWalletRepository();
    await walletRepo.save(driver1Wallet);
    await walletRepo.save(driver2Wallet);

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
      unitOfWork: new MongoUnitOfWork(),
      rideEventRepo: mongoRideEventRepo,
      rideRepo: mongoRideRepo,
      pricingConfigRepo,
      tokenSecret: TEST_SECRET,
    });

    acceptRideUseCase = new AcceptRideUseCase({
      unitOfWork: new MongoUnitOfWork(),
      rideEventRepo: mongoRideEventRepo,
      requireDriverEligibility: async () => 'test-vehicle',
      rideRepo: mongoRideRepo,
      walletRepo,
      otpTtlMinutes: 20,
    });

    driverEnRouteUseCase = new DriverEnRouteUseCase({
      rideRepo: mongoRideRepo,
      rideEventRepo: mongoRideEventRepo,
      unitOfWork: new MongoUnitOfWork(),
    });

    driverArrivedUseCase = new DriverArrivedUseCase({
      rideRepo: mongoRideRepo,
      rideEventRepo: mongoRideEventRepo,
      unitOfWork: new MongoUnitOfWork(),
    });

    startRideUseCase = new StartRideUseCase({
      unitOfWork: new MongoUnitOfWork(),
      rideEventRepo: mongoRideEventRepo,
      rideRepo: mongoRideRepo,
    });

    completeRideUseCase = new CompleteRideUseCase({
      rideRepo: mongoRideRepo,
      walletRepo,
      rideEventRepo: mongoRideEventRepo,
      unitOfWork: new MongoUnitOfWork(),
    });

    cancelRideUseCase = new CancelRideUseCase({
      rideRepo: mongoRideRepo,
      walletRepo,
      rideEventRepo: mongoRideEventRepo,
      unitOfWork: new MongoUnitOfWork(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createInitialRide(riderId = RIDER_ID): Promise<RideEntity> {
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
      riderId,
      passengerName: 'Subir Roy',
      passengerPhoneE164: '+919876543210',
      pickup,
      drop,
      vehicleCategory: 'CAB',
    });
  }

  async function createStartedRide(riderId = RIDER_ID): Promise<RideEntity> {
    const ride = await createInitialRide(riderId);
    const claim = await acceptRideUseCase.execute({ rideId: ride.id, driverId: DRIVER_ID_1 });
    await driverEnRouteUseCase.execute({ rideId: ride.id, driverId: DRIVER_ID_1 });
    await driverArrivedUseCase.execute({ rideId: ride.id, driverId: DRIVER_ID_1 });
    return startRideUseCase.execute({
      rideId: ride.id,
      driverId: DRIVER_ID_1,
      otp: claim._riderPickupOtp!,
    });
  }

  async function createPendingRide(riderId = RIDER_ID): Promise<RideEntity> {
    const ride = await createStartedRide(riderId);
    return (await completeRideUseCase.execute({ rideId: ride.id, driverId: DRIVER_ID_1 })).ride;
  }

  async function expectSingleSettlement(rideId: string, commissionPaise: number): Promise<void> {
    const transactions = await WalletTransactionModel.find({
      reference_id: rideId,
      reference_type: 'RIDE_COMMISSION',
    }).lean();
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.amount_paise).toBe(commissionPaise);
    const events = await RideEventModel.find({
      ride_id: rideId,
      event_type: { $in: ['TRIP_COMPLETED', 'PAYMENT_CONFIRMED', 'RIDE_SETTLED'] },
    }).lean();
    expect(events.map((event) => event.event_type).sort()).toEqual([
      'PAYMENT_CONFIRMED',
      'RIDE_SETTLED',
      'TRIP_COMPLETED',
    ]);
  }

  function synchronizeFirstWalletReads(): void {
    const findWallet = walletRepo.findByDriverId.bind(walletRepo);
    let reads = 0;
    let releaseReads!: () => void;
    const bothRead = new Promise<void>((resolveReads) => {
      releaseReads = resolveReads;
    });
    vi.spyOn(walletRepo, 'findByDriverId').mockImplementation(async (driverId) => {
      const wallet = await findWallet(driverId);
      reads += 1;
      if (reads <= 2) {
        if (reads === 2) releaseReads();
        await bothRead;
      }
      return wallet;
    });
  }

  describe('Atomic completion and settlement retries', () => {
    it('returns the settled outcome on retry without another debit or event pair', async () => {
      const ride = await createPendingRide();
      const completedAt = new Date();
      const first = await completeRideUseCase.confirmPayment({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
        completedAt,
      });
      const retry = await completeRideUseCase.confirmPayment({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
        completedAt: new Date(completedAt.getTime() + 1000),
      });

      expect(retry).toEqual(first);
      expect(retry.ride.completedAt).toEqual(ride.completedAt);
      expect(retry.ride.settledAt).toEqual(completedAt);
      await expectSingleSettlement(ride.id, first.commissionPaise);
      const wallet = await WalletModel.findById(driver1Wallet.id).lean();
      expect(wallet?.balance_paise).toBe(driver1Wallet.balancePaise - first.commissionPaise);
      expect(wallet?.version).toBe(driver1Wallet.version + 1);
    });

    it.each(['wallet balance', 'settlement event'] as const)(
      'rolls back every settlement write after a failure following the %s write and permits retry',
      async (failurePoint) => {
        const ride = await createPendingRide();
        const injectedFailure = new Error(`Injected failure after ${failurePoint} write`);
        if (failurePoint === 'wallet balance') {
          const saveWallet = walletRepo.save.bind(walletRepo);
          vi.spyOn(walletRepo, 'save').mockImplementationOnce(async (wallet) => {
            await saveWallet(wallet);
            throw injectedFailure;
          });
        } else {
          const saveEvent = mongoRideEventRepo.save.bind(mongoRideEventRepo);
          vi.spyOn(mongoRideEventRepo, 'save').mockImplementation(async (event) => {
            const saved = await saveEvent(event);
            if (event.eventType === 'RIDE_SETTLED') throw injectedFailure;
            return saved;
          });
        }

        await expect(
          completeRideUseCase.confirmPayment({ rideId: ride.id, driverId: DRIVER_ID_1 }),
        ).rejects.toThrow(injectedFailure.message);
        vi.restoreAllMocks();

        const persistedRide = await mongoRideRepo.findById(ride.id);
        expect(persistedRide?.status).toBe('PAYMENT_PENDING');
        expect(persistedRide?.version).toBe(ride.version);
        expect(persistedRide?.completedAt).toEqual(ride.completedAt);
        expect(persistedRide?.settledAt).toBeNull();
        const wallet = await WalletModel.findById(driver1Wallet.id).lean();
        expect(wallet?.balance_paise).toBe(driver1Wallet.balancePaise);
        expect(wallet?.version).toBe(driver1Wallet.version);
        expect(await WalletTransactionModel.countDocuments({ reference_id: ride.id })).toBe(0);
        expect(
          await RideEventModel.countDocuments({
            ride_id: ride.id,
            event_type: { $in: ['PAYMENT_CONFIRMED', 'RIDE_SETTLED'] },
          }),
        ).toBe(0);
        expect(
          await RideEventModel.countDocuments({ ride_id: ride.id, event_type: 'TRIP_COMPLETED' }),
        ).toBe(1);

        const result = await completeRideUseCase.confirmPayment({
          rideId: ride.id,
          driverId: DRIVER_ID_1,
        });
        expect(result.ride.status).toBe('SETTLED');
        expect(result.driverWallet.balancePaise).toBe(
          driver1Wallet.balancePaise - result.commissionPaise,
        );
        await expectSingleSettlement(ride.id, result.commissionPaise);
      },
    );

    it('confirms simultaneous payment requests for the same ride with one commission and event pair', async () => {
      const ride = await createPendingRide();
      const results = await Promise.all([
        completeRideUseCase.confirmPayment({ rideId: ride.id, driverId: DRIVER_ID_1 }),
        completeRideUseCase.confirmPayment({ rideId: ride.id, driverId: DRIVER_ID_1 }),
      ]);

      expect(results[0]).toEqual(results[1]);
      expect(results[0]!.ride.status).toBe('SETTLED');
      expect(results[0]!.ride.version).toBe(ride.version + 1);
      await expectSingleSettlement(ride.id, results[0]!.commissionPaise);
      const wallet = await WalletModel.findById(driver1Wallet.id).lean();
      expect(wallet?.balance_paise).toBe(driver1Wallet.balancePaise - results[0]!.commissionPaise);
      expect(wallet?.version).toBe(driver1Wallet.version + 1);
    });

    it('retains both commissions when different rides settle concurrently against the same wallet', async () => {
      const firstRide = await createPendingRide();
      const secondRide = await createPendingRide('018f0a00-0000-7000-8000-000000000202');
      secondRide.agreedFarePaise = firstRide.agreedFarePaise! + 1000;
      await mongoRideRepo.save(secondRide);

      synchronizeFirstWalletReads();

      const [first, second] = await Promise.all([
        completeRideUseCase.confirmPayment({ rideId: firstRide.id, driverId: DRIVER_ID_1 }),
        completeRideUseCase.confirmPayment({ rideId: secondRide.id, driverId: DRIVER_ID_1 }),
      ]);
      expect(first.ride.status).toBe('SETTLED');
      expect(second.ride.status).toBe('SETTLED');
      await expectSingleSettlement(firstRide.id, first.commissionPaise);
      await expectSingleSettlement(secondRide.id, second.commissionPaise);
      const wallet = await WalletModel.findById(driver1Wallet.id).lean();
      expect(wallet?.balance_paise).toBe(
        driver1Wallet.balancePaise - first.commissionPaise - second.commissionPaise,
      );
      expect(wallet?.version).toBe(driver1Wallet.version + 2);
      const transactions = await WalletTransactionModel.find({ wallet_id: driver1Wallet.id })
        .sort({ balance_before_paise: -1 })
        .lean();
      expect(transactions).toHaveLength(2);
      expect(transactions[0]?.balance_before_paise).toBe(driver1Wallet.balancePaise);
      expect(transactions[0]?.balance_after_paise).toBe(transactions[1]?.balance_before_paise);
      expect(transactions[1]?.balance_after_paise).toBe(wallet?.balance_paise);
    });
  });

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

      // 6. Trip completion waits for payment confirmation.
      const completedAt = new Date();
      const pendingResult = await completeRideUseCase.execute({
        rideId: createdRide.id,
        driverId: DRIVER_ID_1,
        completedAt,
      });

      expect(pendingResult.ride.status).toBe('PAYMENT_PENDING');
      expect(pendingResult.ride.completedAt).toEqual(completedAt);
      expect(pendingResult.ride.settledAt).toBeNull();
      expect(pendingResult.driverWallet.balancePaise).toBe(driver1Wallet.balancePaise);
      expect(await WalletTransactionModel.countDocuments({ reference_id: createdRide.id })).toBe(0);
      const confirmedAt = new Date(completedAt.getTime() + 1000);
      const completeResult = await completeRideUseCase.confirmPayment({
        rideId: createdRide.id,
        driverId: DRIVER_ID_1,
        completedAt: confirmedAt,
      });

      expect(completeResult.ride.status).toBe('SETTLED');
      expect(completeResult.ride.completedAt).toEqual(completedAt);
      expect(completeResult.ride.settledAt).toEqual(confirmedAt);
      expect(completeResult.ride.version).toBe(7);

      // 8% commission on 11000 paise (suggested fare for 6km) = Math.round(11000 * 0.08) = 880 paise
      const expectedCommission = Math.round((completeResult.farePaise * 8) / 100);
      expect(completeResult.commissionPaise).toBe(expectedCommission);
      expect(completeResult.driverWallet.balancePaise).toBe(
        driver1Wallet.balancePaise - expectedCommission,
      );

      // Verify MongoDB wallets collection document
      const mongoWalletDoc = await WalletModel.findById(driver1Wallet.id).lean();
      expect(mongoWalletDoc).not.toBeNull();
      expect(mongoWalletDoc?.balance_paise).toBe(driver1Wallet.balancePaise - expectedCommission);
      expect(mongoWalletDoc?.version).toBe(driver1Wallet.version + 1);

      // Verify MongoDB wallet_transactions ledger document
      const mongoTxDoc = await WalletTransactionModel.findOne({
        reference_id: createdRide.id,
      }).lean();
      expect(mongoTxDoc).not.toBeNull();
      expect(mongoTxDoc?.wallet_id).toBe(driver1Wallet.id);
      expect(mongoTxDoc?.driver_id).toBe(DRIVER_ID_1);
      expect(mongoTxDoc?.type).toBe('DEBIT');
      expect(mongoTxDoc?.reference_type).toBe('RIDE_COMMISSION');
      expect(mongoTxDoc?.amount_paise).toBe(expectedCommission);
      expect(mongoTxDoc?.balance_before_paise).toBe(driver1Wallet.balancePaise);
      expect(mongoTxDoc?.balance_after_paise).toBe(driver1Wallet.balancePaise - expectedCommission);
      expect(mongoTxDoc?.idempotency_key).toBe(`commission_debit_${createdRide.id}`);

      // Verify findTransactionsByWalletId query on MongoWalletRepository
      const driverTransactions = await walletRepo.findTransactionsByWalletId(driver1Wallet.id);
      expect(driverTransactions.length).toBe(1);
      expect(driverTransactions[0]?.amountPaise).toBe(expectedCommission);
      expect(driverTransactions[0]?.referenceType).toBe('RIDE_COMMISSION');

      // 7. Verify Final MongoDB State & Audit Trail
      const finalMongoDoc = await RideModel.findById(createdRide.id).lean();
      expect(finalMongoDoc?.status).toBe('SETTLED');
      expect(finalMongoDoc?.completed_at).toEqual(completedAt);
      expect(finalMongoDoc?.settled_at).toEqual(confirmedAt);
      expect(finalMongoDoc?.version).toBe(7);

      // Verify immutable events stored in MongoDB ride_events collection
      const eventsInMongo = await RideEventModel.find({ ride_id: createdRide.id })
        .sort({ created_at: 1, _id: 1 })
        .lean();

      expect(eventsInMongo.length).toBe(8);
      const eventTypes = eventsInMongo.map((e) => e.event_type);
      expect(eventTypes).toEqual(
        expect.arrayContaining([
          'RIDE_CREATED',
          'DRIVER_ASSIGNED',
          'TRIP_STARTED',
          'DRIVER_EN_ROUTE',
          'DRIVER_ARRIVED',
          'TRIP_COMPLETED',
          'PAYMENT_CONFIRMED',
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
      expect(settledEvent?.actor_type).toBe('DRIVER');
      expect(settledEvent?.actor_id).toBe(DRIVER_ID_1);
    });
  });

  describe('Real Database Concurrency & Race Condition', () => {
    it('persists exactly one competing transition for the same ride version', async () => {
      const ride = await createInitialRide();
      const transitions = [
        { ...ride, status: 'CANCELLED' as const, version: ride.version + 1 },
        { ...ride, status: 'EXPIRED' as const, version: ride.version + 1 },
      ];
      const results = await Promise.all(
        transitions.map((transition) => mongoRideRepo.update(transition, ride.version)),
      );
      const saved = results.filter((result) => result !== null);
      expect(saved).toHaveLength(1);
      expect(results.filter((result) => result === null)).toHaveLength(1);
      const persisted = await mongoRideRepo.findById(ride.id);
      expect(persisted?.status).toBe(saved[0]?.status);
      expect(persisted?.version).toBe(ride.version + 1);
    });

    it('does not recreate an absent ride during a versioned transition', async () => {
      const ride = await createInitialRide();
      await RideModel.deleteOne({ _id: ride.id });
      const result = await mongoRideRepo.update(
        { ...ride, status: 'CANCELLED', version: ride.version + 1 },
        ride.version,
      );
      expect(result).toBeNull();
      expect(await RideModel.findById(ride.id).lean()).toBeNull();
    });

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
      const winningDriver = (fulfilled[0] as PromiseFulfilledResult<{ ride: RideEntity }>).value
        .ride.driverId;
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

      const count = await mongoRideRepo.countDailyRiderUnassignedCancellations(RIDER_ID, sinceDate);

      expect(count).toBe(2);
    });
  });

  describe('Atomic offer expiry', () => {
    it('expires a ride once when two sweeps scan the same offering', async () => {
      const ride = await createInitialRide();
      const now = new Date(ride.offeringExpiresAt!.getTime() + 1000);
      const findExpired = mongoRideRepo.findExpiredOfferings.bind(mongoRideRepo);
      let scans = 0;
      let releaseScans!: () => void;
      const bothScanned = new Promise<void>((resolveScans) => {
        releaseScans = resolveScans;
      });
      vi.spyOn(mongoRideRepo, 'findExpiredOfferings').mockImplementation(
        async (deadline, limit) => {
          const expired = await findExpired(deadline, limit);
          scans += 1;
          if (scans === 2) releaseScans();
          await bothScanned;
          return expired;
        },
      );
      const expiry = new ExpireOffersUseCase({
        rideRepo: mongoRideRepo,
        rideEventRepo: mongoRideEventRepo,
        unitOfWork: new MongoUnitOfWork(),
      });

      const results = await Promise.all([expiry.execute(now), expiry.execute(now)]);
      expect(results.flat()).toHaveLength(1);
      const persistedRide = await mongoRideRepo.findById(ride.id);
      expect(persistedRide?.status).toBe('EXPIRED');
      expect(persistedRide?.version).toBe(ride.version + 1);
      expect(persistedRide?.cancellationReason).toBe('TIMEOUT_EXPIRED');
      expect(
        await RideEventModel.countDocuments({ ride_id: ride.id, event_type: 'OFFER_EXPIRED' }),
      ).toBe(1);
    });

    it('rolls back the expired ride and its persisted event on failure, then permits a later sweep', async () => {
      const ride = await createInitialRide();
      const now = new Date(ride.offeringExpiresAt!.getTime() + 1000);
      const expiry = new ExpireOffersUseCase({
        rideRepo: mongoRideRepo,
        rideEventRepo: mongoRideEventRepo,
        unitOfWork: new MongoUnitOfWork(),
      });
      const saveEvent = mongoRideEventRepo.save.bind(mongoRideEventRepo);
      vi.spyOn(mongoRideEventRepo, 'save').mockImplementationOnce(async (event) => {
        await saveEvent(event);
        throw new Error('Injected failure after offer expiry event write');
      });

      await expect(expiry.execute(now)).rejects.toThrow('Injected failure');
      vi.restoreAllMocks();
      const persistedRide = await mongoRideRepo.findById(ride.id);
      expect(persistedRide?.status).toBe('OFFERING');
      expect(persistedRide?.version).toBe(ride.version);
      expect(persistedRide?.cancellationReason).toBeNull();
      expect(
        await RideEventModel.countDocuments({ ride_id: ride.id, event_type: 'OFFER_EXPIRED' }),
      ).toBe(0);
      expect(
        await RideEventModel.countDocuments({ ride_id: ride.id, event_type: 'RIDE_CREATED' }),
      ).toBe(1);

      const results = await expiry.execute(now);
      expect(results).toHaveLength(1);
      expect(results[0]?.status).toBe('EXPIRED');
      expect(results[0]?.version).toBe(ride.version + 1);
      expect(
        await RideEventModel.countDocuments({ ride_id: ride.id, event_type: 'OFFER_EXPIRED' }),
      ).toBe(1);
    });

    it('rejects an atomic driver claim after the offering deadline has passed', async () => {
      const ride = await createInitialRide();
      ride.offeringExpiresAt = new Date(Date.now() - 1000);
      await mongoRideRepo.save(ride);

      const claimed = await mongoRideRepo.atomicClaimRide({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
        agreedFarePaise: ride.proposedFarePaise ?? ride.suggestedFarePaise,
        pickupOtpHash: 'unused-expired-claim-hash',
        pickupOtpExpiresAt: new Date(Date.now() + 1200000),
      });
      expect(claimed).toBeNull();
      const persistedRide = await mongoRideRepo.findById(ride.id);
      expect(persistedRide?.status).toBe('OFFERING');
      expect(persistedRide?.driverId).toBeNull();
      expect(persistedRide?.version).toBe(ride.version);
    });
  });

  describe('Cancellation Lifecycle & Persistence', () => {
    it('rolls back cancellation and compensation when the wallet write fails, then permits retry', async () => {
      const ride = await createInitialRide();
      const claim = await acceptRideUseCase.execute({ rideId: ride.id, driverId: DRIVER_ID_1 });
      const input = {
        rideId: ride.id,
        actorType: 'RIDER' as const,
        actorId: RIDER_ID,
        reason: 'RIDER_CHANGED_MIND' as const,
        cancelledAt: new Date(claim.ride.acceptedAt!.getTime() + 180000),
      };
      const saveWallet = walletRepo.save.bind(walletRepo);
      vi.spyOn(walletRepo, 'save').mockImplementationOnce(async (wallet) => {
        await saveWallet(wallet);
        throw new Error('Injected failure after cancellation compensation wallet write');
      });

      await expect(cancelRideUseCase.execute(input)).rejects.toThrow('Injected failure');
      vi.restoreAllMocks();
      const persistedRide = await mongoRideRepo.findById(ride.id);
      expect(persistedRide?.status).toBe('DRIVER_ASSIGNED');
      expect(persistedRide?.version).toBe(claim.ride.version);
      expect(persistedRide?.cancelledAt).toBeNull();
      expect(persistedRide?.cancellationReason).toBeNull();
      const wallet = await WalletModel.findById(driver1Wallet.id).lean();
      expect(wallet?.balance_paise).toBe(driver1Wallet.balancePaise);
      expect(wallet?.version).toBe(driver1Wallet.version);
      expect(await WalletTransactionModel.countDocuments({ reference_id: ride.id })).toBe(0);
      expect(
        await RideEventModel.countDocuments({ ride_id: ride.id, event_type: 'RIDE_CANCELLED' }),
      ).toBe(0);
      expect(
        await RideEventModel.countDocuments({
          ride_id: ride.id,
          event_type: { $in: ['RIDE_CREATED', 'DRIVER_ASSIGNED'] },
        }),
      ).toBe(2);

      const result = await cancelRideUseCase.execute(input);
      expect(result.ride.status).toBe('CANCELLED');
      expect(result.driverWallet?.balancePaise).toBe(driver1Wallet.balancePaise + 3500);
      expect(await WalletTransactionModel.countDocuments({ reference_id: ride.id })).toBe(1);
      expect(
        await RideEventModel.countDocuments({ ride_id: ride.id, event_type: 'RIDE_CANCELLED' }),
      ).toBe(1);
    });

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

      // Verify driver compensation credited to wallet in MongoDB
      const mongoDriverWallet = await WalletModel.findById(driver1Wallet.id).lean();
      expect(mongoDriverWallet?.balance_paise).toBe(driver1Wallet.balancePaise + 3500);

      const cancelCompTx = await WalletTransactionModel.findOne({
        reference_id: createdRide.id,
        reference_type: 'CANCELLATION_COMPENSATION',
      }).lean();
      expect(cancelCompTx).not.toBeNull();
      expect(cancelCompTx?.type).toBe('CREDIT');
      expect(cancelCompTx?.amount_paise).toBe(3500);
      expect(cancelCompTx?.balance_after_paise).toBe(driver1Wallet.balancePaise + 3500);
    });
  });

  describe('Wallet Zero Invariant & Commission Settlement in MongoDB', () => {
    it('settles ride normally even if commission drives balance negative, but blocks subsequent ride acceptance', async () => {
      // 1. Set driver wallet to low initial balance (500 paise = ₹5.00)
      const lowBalanceWallet: WalletEntity = {
        ...driver1Wallet,
        balancePaise: 500,
        version: 1,
      };
      await walletRepo.save(lowBalanceWallet);

      // 2. Create and claim ride
      const createdRide = await createInitialRide();
      const claimResult = await acceptRideUseCase.execute({
        rideId: createdRide.id,
        driverId: DRIVER_ID_1,
      });
      expect(claimResult.ride.status).toBe('DRIVER_ASSIGNED');

      // 3. Progress ride: En-route -> Arrived -> Start
      await driverEnRouteUseCase.execute({ rideId: createdRide.id, driverId: DRIVER_ID_1 });
      await driverArrivedUseCase.execute({ rideId: createdRide.id, driverId: DRIVER_ID_1 });
      await startRideUseCase.execute({
        rideId: createdRide.id,
        driverId: DRIVER_ID_1,
        otp: claimResult._riderPickupOtp!,
      });

      // 4. Complete the trip, then confirm receipt before posting 8% commission.
      const pendingResult = await completeRideUseCase.execute({
        rideId: createdRide.id,
        driverId: DRIVER_ID_1,
      });
      expect(pendingResult.ride.status).toBe('PAYMENT_PENDING');
      expect(pendingResult.driverWallet.balancePaise).toBe(500);
      const completeResult = await completeRideUseCase.confirmPayment({
        rideId: createdRide.id,
        driverId: DRIVER_ID_1,
      });

      const expectedCommission = Math.round((completeResult.farePaise * 8) / 100);
      const expectedBalanceAfter = 500 - expectedCommission;

      expect(completeResult.ride.status).toBe('SETTLED');
      expect(completeResult.commissionPaise).toBe(expectedCommission);
      expect(completeResult.driverWallet.balancePaise).toBe(expectedBalanceAfter);

      // Verify MongoDB documents
      const mongoWallet = await WalletModel.findById(driver1Wallet.id).lean();
      expect(mongoWallet?.balance_paise).toBe(expectedBalanceAfter);

      const mongoTx = await WalletTransactionModel.findOne({
        reference_id: createdRide.id,
        reference_type: 'RIDE_COMMISSION',
      }).lean();
      expect(mongoTx).not.toBeNull();
      expect(mongoTx?.amount_paise).toBe(expectedCommission);
      expect(mongoTx?.balance_before_paise).toBe(500);
      expect(mongoTx?.balance_after_paise).toBe(expectedBalanceAfter);

      // 5. Subsequent ride acceptance attempt MUST be blocked by Wallet Zero Invariant
      const secondRide = await createInitialRide();
      await expect(
        acceptRideUseCase.execute({
          rideId: secondRide.id,
          driverId: DRIVER_ID_1,
        }),
      ).rejects.toThrow('DRIVER_WALLET_ZERO_BALANCE');
    });
  });

  describe('Atomic finance adjustments', () => {
    it('rolls back the adjustment ledger and persisted wallet balance on failure, then permits retry', async () => {
      const adjustWallet = new AdminAdjustWalletUseCase(walletRepo, new MongoUnitOfWork());
      const input = {
        driverId: DRIVER_ID_1,
        amountPaise: 2500,
        type: 'CREDIT' as const,
        reason: 'Finance adjustment regression',
        adminId: cabPricingConfig.createdByAdminId,
        idempotencyKey: 'admin-adjustment-rollback',
      };
      const saveWallet = walletRepo.save.bind(walletRepo);
      vi.spyOn(walletRepo, 'save').mockImplementationOnce(async (wallet) => {
        await saveWallet(wallet);
        throw new Error('Injected failure after finance adjustment wallet write');
      });

      await expect(adjustWallet.execute(input)).rejects.toThrow('Injected failure');
      vi.restoreAllMocks();
      const wallet = await WalletModel.findById(driver1Wallet.id).lean();
      expect(wallet?.balance_paise).toBe(driver1Wallet.balancePaise);
      expect(wallet?.version).toBe(driver1Wallet.version);
      expect(await WalletTransactionModel.countDocuments({ wallet_id: driver1Wallet.id })).toBe(0);

      const result = await adjustWallet.execute(input);
      expect(result.wallet.balancePaise).toBe(driver1Wallet.balancePaise + input.amountPaise);
      const transactions = await WalletTransactionModel.find({
        wallet_id: driver1Wallet.id,
      }).lean();
      expect(transactions).toHaveLength(1);
      expect(transactions[0]?.idempotency_key).toBe(input.idempotencyKey);
      expect(transactions[0]?.balance_before_paise).toBe(driver1Wallet.balancePaise);
      expect(transactions[0]?.balance_after_paise).toBe(result.wallet.balancePaise);
    });

    it('retains both credit and debit adjustments made concurrently to the same wallet', async () => {
      const adjustWallet = new AdminAdjustWalletUseCase(walletRepo, new MongoUnitOfWork());
      const common = {
        driverId: DRIVER_ID_1,
        reason: 'Concurrent finance adjustment regression',
        adminId: cabPricingConfig.createdByAdminId,
      };
      synchronizeFirstWalletReads();
      await Promise.all([
        adjustWallet.execute({
          ...common,
          amountPaise: 2500,
          type: 'CREDIT',
          idempotencyKey: 'concurrent-finance-credit',
        }),
        adjustWallet.execute({
          ...common,
          amountPaise: 5000,
          type: 'DEBIT',
          idempotencyKey: 'concurrent-finance-debit',
        }),
      ]);

      const wallet = await WalletModel.findById(driver1Wallet.id).lean();
      expect(wallet?.balance_paise).toBe(driver1Wallet.balancePaise + 2500 - 5000);
      expect(wallet?.version).toBe(driver1Wallet.version + 2);
      const transactions = await WalletTransactionModel.find({
        wallet_id: driver1Wallet.id,
      }).lean();
      expect(transactions).toHaveLength(2);
      expect(transactions.map((transaction) => transaction.idempotency_key).sort()).toEqual([
        'concurrent-finance-credit',
        'concurrent-finance-debit',
      ]);
      const first = transactions.find(
        (transaction) => transaction.balance_before_paise === driver1Wallet.balancePaise,
      );
      expect(first).toBeDefined();
      const second = transactions.find((transaction) => transaction._id !== first!._id);
      expect(second?.balance_before_paise).toBe(first?.balance_after_paise);
      expect(second?.balance_after_paise).toBe(wallet?.balance_paise);
    });
  });

  it('rolls back rider-win commission refund when the resolution event write fails', async () => {
    const pending = await createPendingRide();
    await completeRideUseCase.confirmPayment({ rideId: pending.id, driverId: DRIVER_ID_1 });
    await completeRideUseCase.disputePayment({
      rideId: pending.id,
      riderId: RIDER_ID,
      reason: 'The cash amount was incorrect',
    });
    const settledWallet = await walletRepo.findByDriverId(DRIVER_ID_1);
    const originalSave = mongoRideEventRepo.save.bind(mongoRideEventRepo);
    vi.spyOn(mongoRideEventRepo, 'save').mockImplementation(async (event) => {
      if (event.eventType === 'PAYMENT_DISPUTE_RESOLVED') throw new Error('audit write failed');
      return originalSave(event);
    });
    const resolution = {
      rideId: pending.id,
      adminId: 'admin',
      outcome: 'RIDER_WINS' as const,
      reason: 'Verified payment discrepancy',
    };
    await expect(completeRideUseCase.resolveDispute(resolution)).rejects.toThrow(
      'audit write failed',
    );
    expect((await mongoRideRepo.findById(pending.id))?.status).toBe('PAYMENT_DISPUTED');
    expect((await walletRepo.findByDriverId(DRIVER_ID_1))?.balancePaise).toBe(
      settledWallet?.balancePaise,
    );
    expect(
      await WalletTransactionModel.countDocuments({
        idempotency_key: `dispute_refund_${pending.id}`,
      }),
    ).toBe(0);
    vi.restoreAllMocks();
    await completeRideUseCase.resolveDispute(resolution);
    expect((await mongoRideRepo.findById(pending.id))?.status).toBe('SETTLED');
    expect(
      await WalletTransactionModel.countDocuments({
        idempotency_key: `dispute_refund_${pending.id}`,
      }),
    ).toBe(1);
  });
});
