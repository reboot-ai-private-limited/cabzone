import { describe, expect, it } from 'vitest';
import {
  AcceptRideUseCase,
  CancelRideUseCase,
  CompleteRideUseCase,
  CreateRideUseCase,
  DriverArrivedUseCase,
  DriverEnRouteUseCase,
  MemoryRideEventRepository,
  MemoryRideRepository,
  StartRideUseCase,
  type RideEntity,
} from '../src/modules/rides/index.js';
import {
  isDriverEligibleForNewRides,
  MemoryWalletRepository,
  type WalletEntity,
} from '../src/modules/ledger/index.js';

import {
  CreateQuoteUseCase,
  MemoryPricingConfigRepository,
  type PricingConfigEntity,
} from '../src/modules/pricing/index.js';
import {
  MemoryZoneRepository,
  ResolveZonesUseCase,
  ServiceClassificationUseCase,
  type ZoneEntity,
} from '../src/modules/zone/index.js';

describe('Ride Lifecycle: Curbside Arrival & En-Route Progression', () => {
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

  const driverWallet: WalletEntity = {
    id: '018f0a00-0000-7000-8000-000000000301',
    driverId: DRIVER_ID_1,
    balancePaise: 250000,
    lockedPaise: 0,
    currency: 'INR',
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function setupFixture() {
    const zoneRepo = new MemoryZoneRepository();
    zoneRepo.save(siliguriCityZone);

    const resolveZonesUseCase = new ResolveZonesUseCase({ zoneRepo });
    const serviceClassificationUseCase = new ServiceClassificationUseCase({ resolveZonesUseCase });
    const pricingConfigRepo = new MemoryPricingConfigRepository();
    pricingConfigRepo.save(cabPricingConfig);

    const quoteUseCase = new CreateQuoteUseCase({
      serviceClassificationUseCase,
      pricingConfigRepo,
      tokenSecret: TEST_SECRET,
      quoteTtlSeconds: 300,
    });

    const rideRepo = new MemoryRideRepository();
    const rideEventRepo = new MemoryRideEventRepository();
    const walletRepo = new MemoryWalletRepository();
    walletRepo.save(driverWallet);

    const createRideUseCase = new CreateRideUseCase({ unitOfWork, rideEventRepo,
      rideRepo,
      pricingConfigRepo,
      tokenSecret: TEST_SECRET,
    });

    const acceptRideUseCase = new AcceptRideUseCase({ unitOfWork, rideEventRepo,
      requireDriverEligibility: async () => 'test-vehicle',
      rideRepo,
      walletRepo,
      otpTtlMinutes: 20,
    });

    const driverEnRouteUseCase = new DriverEnRouteUseCase({
      unitOfWork,
      rideRepo,
      rideEventRepo,
    });

    const driverArrivedUseCase = new DriverArrivedUseCase({
      unitOfWork,
      rideRepo,
      rideEventRepo,
    });

    const startRideUseCase = new StartRideUseCase({ unitOfWork, rideEventRepo,
      rideRepo,
    });

    const completeRideUseCase = new CompleteRideUseCase({
      unitOfWork,
      rideRepo,
      walletRepo,
      rideEventRepo,
    });

    const cancelRideUseCase = new CancelRideUseCase({
      unitOfWork,
      rideRepo,
      walletRepo,
      rideEventRepo,
    });

    return {
      quoteUseCase,
      rideRepo,
      rideEventRepo,
      walletRepo,
      createRideUseCase,
      acceptRideUseCase,
      driverEnRouteUseCase,
      driverArrivedUseCase,
      startRideUseCase,
      completeRideUseCase,
      cancelRideUseCase,
    };
  }

  async function createAssignedRide(fixture: ReturnType<typeof setupFixture>) {
    const pickup = { lat: 26.71, lng: 88.42, address: 'Hill Cart Road' };
    const drop = { lat: 26.75, lng: 88.45, address: 'Sevoke Road' };

    const quote = await fixture.quoteUseCase.execute({
      pickup,
      drop,
      vehicleCategory: 'CAB',
      distanceM: 6000,
      durationSeconds: 900,
    });

    const ride = await fixture.createRideUseCase.execute({
      quoteToken: quote.quoteToken,
      proposedFarePaise: quote.suggestedFarePaise,
      riderId: RIDER_ID,
      passengerName: 'Subir Roy',
      passengerPhoneE164: '+919876543210',
      pickup,
      drop,
      vehicleCategory: 'CAB',
    });

    const accepted = await fixture.acceptRideUseCase.execute({
      rideId: ride.id,
      driverId: DRIVER_ID_1,
    });

    return {
      ride: accepted.ride,
      otp: accepted._riderPickupOtp!,
    };
  }

  async function createStartedRide(fixture: ReturnType<typeof setupFixture>) {
    const { ride, otp } = await createAssignedRide(fixture);
    await fixture.driverEnRouteUseCase.execute({
      rideId: ride.id,
      driverId: DRIVER_ID_1,
    });
    await fixture.driverArrivedUseCase.execute({
      rideId: ride.id,
      driverId: DRIVER_ID_1,
    });
    const started = await fixture.startRideUseCase.execute({
      rideId: ride.id,
      driverId: DRIVER_ID_1,
      otp,
    });
    return { ride: started, otp };
  }


  describe('DriverEnRouteUseCase', () => {
    it('successfully transitions from DRIVER_ASSIGNED to DRIVER_EN_ROUTE and records immutable RideEvent', async () => {
      const fixture = setupFixture();
      const { ride } = await createAssignedRide(fixture);

      expect(ride.status).toBe('DRIVER_ASSIGNED');
      expect(ride.driverId).toBe(DRIVER_ID_1);

      const enRouteRide = await fixture.driverEnRouteUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
        metadata: { currentLat: 26.705, currentLng: 88.415 },
      });

      expect(enRouteRide.status).toBe('DRIVER_EN_ROUTE');
      expect(enRouteRide.version).toBe(ride.version + 1);

      // Verify event was logged immutably
      const events = await fixture.rideEventRepo.findByRideId(ride.id);
      expect(events).toHaveLength(3);
      expect(events.map((e) => e.eventType)).toEqual(['RIDE_CREATED', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE']);
      expect(events.find((e) => e.eventType === 'DRIVER_EN_ROUTE')).toMatchObject({
        rideId: ride.id,
        eventType: 'DRIVER_EN_ROUTE',
        actorType: 'DRIVER',
        actorId: DRIVER_ID_1,
        previousStatus: 'DRIVER_ASSIGNED',
        newStatus: 'DRIVER_EN_ROUTE',
        metadata: { currentLat: 26.705, currentLng: 88.415 },
      });
    });

    it('rejects progression when driver is not the assigned driver', async () => {
      const fixture = setupFixture();
      const { ride } = await createAssignedRide(fixture);

      await expect(
        fixture.driverEnRouteUseCase.execute({
          rideId: ride.id,
          driverId: DRIVER_ID_2,
        }),
      ).rejects.toThrow('UNAUTHORIZED_DRIVER');

      // State remains DRIVER_ASSIGNED
      const current = await fixture.rideRepo.findById(ride.id);
      expect(current?.status).toBe('DRIVER_ASSIGNED');

      // Unauthorized progression leaves the creation and assignment events untouched.
      const events = await fixture.rideEventRepo.findByRideId(ride.id);
      expect(events).toHaveLength(2);
      expect(events.map((e) => e.eventType)).toEqual(['RIDE_CREATED', 'DRIVER_ASSIGNED']);
    });

    it('rejects progression when ride does not exist', async () => {
      const fixture = setupFixture();

      await expect(
        fixture.driverEnRouteUseCase.execute({
          rideId: '018f0a00-0000-7000-8000-999999999999',
          driverId: DRIVER_ID_1,
        }),
      ).rejects.toThrow('RIDE_NOT_FOUND');
    });

    it('rejects progression from invalid states', async () => {
      const fixture = setupFixture();
      const { ride } = await createAssignedRide(fixture);

      // Transition to DRIVER_EN_ROUTE
      await fixture.driverEnRouteUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
      });

      // Trying to trigger DRIVER_EN_ROUTE again
      await expect(
        fixture.driverEnRouteUseCase.execute({
          rideId: ride.id,
          driverId: DRIVER_ID_1,
        }),
      ).rejects.toThrow('INVALID_RIDE_STATE');

      // Transition manually to CANCELLED and test rejection
      await fixture.rideRepo.save({
        ...ride,
        status: 'CANCELLED',
      });

      await expect(
        fixture.driverEnRouteUseCase.execute({
          rideId: ride.id,
          driverId: DRIVER_ID_1,
        }),
      ).rejects.toThrow('INVALID_RIDE_STATE');
    });
  });

  describe('DriverArrivedUseCase', () => {
    it('successfully transitions from DRIVER_EN_ROUTE to DRIVER_ARRIVED and records arrivedAt + RideEvent', async () => {
      const fixture = setupFixture();
      const { ride } = await createAssignedRide(fixture);

      await fixture.driverEnRouteUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
      });

      const arrivalTime = new Date('2026-09-26T10:15:00.000Z');
      const arrivedRide = await fixture.driverArrivedUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
        arrivedAt: arrivalTime,
        metadata: { accuracyMeters: 5 },
      });

      expect(arrivedRide.status).toBe('DRIVER_ARRIVED');
      expect(arrivedRide.arrivedAt).toEqual(arrivalTime);
      expect(arrivedRide.version).toBe(ride.version + 2);

      // Verify immutable event log
      const events = await fixture.rideEventRepo.findByRideId(ride.id);
      expect(events).toHaveLength(4);

      const arrivedEvent = events.find((e) => e.eventType === 'DRIVER_ARRIVED');
      expect(arrivedEvent).toBeDefined();
      expect(arrivedEvent).toMatchObject({
        rideId: ride.id,
        eventType: 'DRIVER_ARRIVED',
        actorType: 'DRIVER',
        actorId: DRIVER_ID_1,
        previousStatus: 'DRIVER_EN_ROUTE',
        newStatus: 'DRIVER_ARRIVED',
        metadata: {
          arrivedAt: arrivalTime.toISOString(),
          accuracyMeters: 5,
        },
      });
    });

    it('rejects arrival when driver is not the assigned driver', async () => {
      const fixture = setupFixture();
      const { ride } = await createAssignedRide(fixture);

      await fixture.driverEnRouteUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
      });

      await expect(
        fixture.driverArrivedUseCase.execute({
          rideId: ride.id,
          driverId: DRIVER_ID_2,
        }),
      ).rejects.toThrow('UNAUTHORIZED_DRIVER');

      const current = await fixture.rideRepo.findById(ride.id);
      expect(current?.status).toBe('DRIVER_EN_ROUTE');
      expect(current?.arrivedAt).toBeNull();
    });

    it('rejects arrival when ride does not exist', async () => {
      const fixture = setupFixture();

      await expect(
        fixture.driverArrivedUseCase.execute({
          rideId: '018f0a00-0000-7000-8000-999999999999',
          driverId: DRIVER_ID_1,
        }),
      ).rejects.toThrow('RIDE_NOT_FOUND');
    });

    it('rejects skipping DRIVER_EN_ROUTE directly from DRIVER_ASSIGNED', async () => {
      const fixture = setupFixture();
      const { ride } = await createAssignedRide(fixture);

      expect(ride.status).toBe('DRIVER_ASSIGNED');

      // Attempting to arrive without going en-route
      await expect(
        fixture.driverArrivedUseCase.execute({
          rideId: ride.id,
          driverId: DRIVER_ID_1,
        }),
      ).rejects.toThrow('INVALID_RIDE_STATE');

      const current = await fixture.rideRepo.findById(ride.id);
      expect(current?.status).toBe('DRIVER_ASSIGNED');
      expect(current?.arrivedAt).toBeNull();
    });

    it('rejects arrival from already arrived or terminal states', async () => {
      const fixture = setupFixture();
      const { ride } = await createAssignedRide(fixture);

      await fixture.driverEnRouteUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
      });

      await fixture.driverArrivedUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
      });

      // Attempting arrival again when already DRIVER_ARRIVED
      await expect(
        fixture.driverArrivedUseCase.execute({
          rideId: ride.id,
          driverId: DRIVER_ID_1,
        }),
      ).rejects.toThrow('INVALID_RIDE_STATE');
    });
  });

  describe('Curbside Gatekeeper: Complete End-to-End Progression', () => {
    it('enforces DRIVER_ARRIVED as gatekeeper for curbside OTP start', async () => {
      const fixture = setupFixture();
      const { ride, otp } = await createAssignedRide(fixture);

      // Step 1: In DRIVER_ASSIGNED state, starting trip must fail
      await expect(
        fixture.startRideUseCase.execute({
          rideId: ride.id,
          driverId: DRIVER_ID_1,
          otp,
        }),
      ).rejects.toThrow('INVALID_RIDE_STATE');

      // Step 2: In DRIVER_EN_ROUTE state, starting trip must still fail
      await fixture.driverEnRouteUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
      });

      await expect(
        fixture.startRideUseCase.execute({
          rideId: ride.id,
          driverId: DRIVER_ID_1,
          otp,
        }),
      ).rejects.toThrow('INVALID_RIDE_STATE');

      // Step 3: Once DRIVER_ARRIVED is reached, curbside wait starts and OTP verification unlocks
      const arrivalTime = new Date();
      await fixture.driverArrivedUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
        arrivedAt: arrivalTime,
      });

      // Step 4: OTP verification succeeds and transitions to TRIP_STARTED
      const startedRide = await fixture.startRideUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
        otp,
      });

      expect(startedRide.status).toBe('TRIP_STARTED');
      expect(startedRide.startedAt).toBeInstanceOf(Date);
      expect(startedRide.arrivedAt).toEqual(arrivalTime);

      // Audit trail confirms orderly progression
      const events = await fixture.rideEventRepo.findByRideId(ride.id);
      expect(events).toHaveLength(5);
      expect(events.map((e) => e.eventType)).toEqual(['RIDE_CREATED', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'TRIP_STARTED']);
    });
  });

  describe('CompleteRideUseCase: Trip Completion & Commission Settlement', () => {
    it('waits for payment confirmation before debiting 8% commission and records both phases', async () => {
      const fixture = setupFixture();
      const { ride } = await createStartedRide(fixture);

      expect(ride.status).toBe('TRIP_STARTED');

      const completedTime = new Date('2026-09-26T10:45:00.000Z');
      const pending = await fixture.completeRideUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
        completedAt: completedTime,
        metadata: { dropOffConfirmed: true },
      });

      expect(pending.ride.status).toBe('PAYMENT_PENDING');
      expect(pending.driverWallet.balancePaise).toBe(250000);
      expect(await fixture.walletRepo.findTransactionsByWalletId(driverWallet.id)).toHaveLength(0);
      const result = await fixture.completeRideUseCase.confirmPayment({ rideId: ride.id, driverId: DRIVER_ID_1, completedAt: completedTime });

      // 1. Explicit payment confirmation settles the completed trip.
      expect(result.ride.status).toBe('SETTLED');
      expect(result.ride.completedAt).toEqual(completedTime);
      expect(result.ride.settledAt).toEqual(completedTime);
      expect(result.ride.version).toBe(ride.version + 2);

      // 2. Exact 8% commission calculation
      const expectedCommission = Math.round((result.farePaise * 8) / 100);
      expect(result.commissionPaise).toBe(expectedCommission);
      expect(result.commissionPaise).toBeGreaterThan(0);

      // 3. Commission debit recorded in driver wallet ledger
      const transactions = await fixture.walletRepo.findTransactionsByWalletId(driverWallet.id);
      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toMatchObject({
        walletId: driverWallet.id,
        driverId: DRIVER_ID_1,
        type: 'DEBIT',
        amountPaise: expectedCommission,
        referenceType: 'RIDE_COMMISSION',
        referenceId: ride.id,
        idempotencyKey: `commission_debit_${ride.id}`,
        balanceBeforePaise: 250000,
        balanceAfterPaise: 250000 - expectedCommission,
      });

      // 4. Driver wallet balance updated
      const updatedWallet = await fixture.walletRepo.findByDriverId(DRIVER_ID_1);
      expect(updatedWallet?.balancePaise).toBe(250000 - expectedCommission);
      expect(result.driverWallet.balancePaise).toBe(250000 - expectedCommission);

      // 5. Immutable events: TRIP_COMPLETED and RIDE_SETTLED
      const events = await fixture.rideEventRepo.findByRideId(ride.id);
      expect(events).toHaveLength(8);
      expect(events.map((e) => e.eventType)).toEqual(['RIDE_CREATED', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'TRIP_STARTED', 'TRIP_COMPLETED', 'PAYMENT_CONFIRMED', 'RIDE_SETTLED']);

      const completedEvent = events.find((e) => e.eventType === 'TRIP_COMPLETED');
      expect(completedEvent).toMatchObject({
        rideId: ride.id,
        eventType: 'TRIP_COMPLETED',
        actorType: 'DRIVER',
        actorId: DRIVER_ID_1,
        previousStatus: 'TRIP_STARTED',
        newStatus: 'PAYMENT_PENDING',
        metadata: {
          farePaise: result.farePaise,
          completedAt: completedTime.toISOString(),
          dropOffConfirmed: true,
        },
      });

      const settledEvent = events.find((e) => e.eventType === 'RIDE_SETTLED');
      expect(events.find((e) => e.eventType === 'PAYMENT_CONFIRMED')).toMatchObject({
        actorType: 'DRIVER',
        actorId: DRIVER_ID_1,
        previousStatus: 'PAYMENT_PENDING',
        newStatus: 'SETTLED',
      });
      expect(settledEvent).toMatchObject({
        rideId: ride.id,
        eventType: 'RIDE_SETTLED',
        actorType: 'DRIVER',
        actorId: DRIVER_ID_1,
        previousStatus: 'PAYMENT_PENDING',
        newStatus: 'SETTLED',
        metadata: {
          settledAt: completedTime.toISOString(),
          farePaise: result.farePaise,
          commissionPaise: expectedCommission,
          commissionPercent: 8,
          driverWalletId: driverWallet.id,
        },
      });
    });

    it('The Wallet Zero Invariant: active trip completes and settles normally even if debit drops wallet to zero or negative, while blocking driver from subsequent rides', async () => {
      const fixture = setupFixture();

      // Driver starts at exactly the Rs. 50 minimum, so they can accept the ride.
      await fixture.walletRepo.save({
        ...driverWallet,
        balancePaise: 5_000,
      });

      const { ride } = await createStartedRide(fixture);
      expect(ride.status).toBe('TRIP_STARTED');

      // Balance drops to Rs. 5 (500 paise) while the trip is in progress.
      const midTripWallet = await fixture.walletRepo.findByDriverId(DRIVER_ID_1);
      await fixture.walletRepo.save({ ...midTripWallet!, balancePaise: 500 });

      // Completing the trip incurs 8% commission (approx Rs. 8 - 12 / 800 - 1200 paise)
      const pending = await fixture.completeRideUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
      });

      expect(pending.ride.status).toBe('PAYMENT_PENDING');
      expect(pending.driverWallet.balancePaise).toBe(500);
      const result = await fixture.completeRideUseCase.confirmPayment({ rideId: ride.id, driverId: DRIVER_ID_1 });

      // Payment confirmation settles even when commission exhausts the wallet.
      expect(result.ride.status).toBe('SETTLED');

      // Balance goes strictly negative (500 - commission < 0)
      expect(result.driverWallet.balancePaise).toBeLessThan(0);
      expect(result.driverWallet.balancePaise).toBe(500 - result.commissionPaise);

      // Driver is now ineligible for new rides (Wallet Zero Invariant per D-008 & D-036)
      expect(isDriverEligibleForNewRides(result.driverWallet)).toBe(false);

      // Verify that driver cannot accept subsequent rides with negative balance
      const newRideQuote = await fixture.quoteUseCase.execute({
        pickup: { lat: 26.71, lng: 88.42 },
        drop: { lat: 26.75, lng: 88.45 },
        vehicleCategory: 'CAB',
        distanceM: 5000,
        durationSeconds: 800,
      });

      const newRide = await fixture.createRideUseCase.execute({
        quoteToken: newRideQuote.quoteToken,
        proposedFarePaise: newRideQuote.suggestedFarePaise,
        riderId: RIDER_ID,
        passengerName: 'Passenger 2',
        passengerPhoneE164: '+919876543211',
        pickup: { lat: 26.71, lng: 88.42 },
        drop: { lat: 26.75, lng: 88.45 },
        vehicleCategory: 'CAB',
      });

      await expect(
        fixture.acceptRideUseCase.execute({
          rideId: newRide.id,
          driverId: DRIVER_ID_1,
        }),
      ).rejects.toThrow('DRIVER_WALLET_ZERO_BALANCE');
    });

    it('rejects completion by unauthorized driver', async () => {
      const fixture = setupFixture();
      const { ride } = await createStartedRide(fixture);

      await expect(
        fixture.completeRideUseCase.execute({
          rideId: ride.id,
          driverId: DRIVER_ID_2,
        }),
      ).rejects.toThrow('UNAUTHORIZED_DRIVER');

      // State remains TRIP_STARTED
      const current = await fixture.rideRepo.findById(ride.id);
      expect(current?.status).toBe('TRIP_STARTED');

      // Wallet was not debited
      const wallet = await fixture.walletRepo.findByDriverId(DRIVER_ID_1);
      expect(wallet?.balancePaise).toBe(250000);
    });

    it('rejects completion from non-started ride states', async () => {
      const fixture = setupFixture();
      const { ride } = await createAssignedRide(fixture);

      // In DRIVER_ASSIGNED state
      await expect(
        fixture.completeRideUseCase.execute({
          rideId: ride.id,
          driverId: DRIVER_ID_1,
        }),
      ).rejects.toThrow('INVALID_RIDE_STATE');

      // In DRIVER_EN_ROUTE state
      await fixture.driverEnRouteUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
      });

      await expect(
        fixture.completeRideUseCase.execute({
          rideId: ride.id,
          driverId: DRIVER_ID_1,
        }),
      ).rejects.toThrow('INVALID_RIDE_STATE');

      // In DRIVER_ARRIVED state
      await fixture.driverArrivedUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
      });

      await expect(
        fixture.completeRideUseCase.execute({
          rideId: ride.id,
          driverId: DRIVER_ID_1,
        }),
      ).rejects.toThrow('INVALID_RIDE_STATE');
    });

    it('rejects completion when ride does not exist', async () => {
      const fixture = setupFixture();

      await expect(
        fixture.completeRideUseCase.execute({
          rideId: '018f0a00-0000-7000-8000-999999999999',
          driverId: DRIVER_ID_1,
        }),
      ).rejects.toThrow('RIDE_NOT_FOUND');
    });

    it('rejects completion when driver wallet does not exist', async () => {
      const fixture = setupFixture();
      const { ride } = await createStartedRide(fixture);

      // Create a ride assigned to a driver with no wallet
      const driverWithoutWallet = '018f0a00-0000-7000-8000-000000000999';
      await fixture.rideRepo.save({
        ...ride,
        driverId: driverWithoutWallet,
      });

      await expect(
        fixture.completeRideUseCase.execute({
          rideId: ride.id,
          driverId: driverWithoutWallet,
        }),
      ).rejects.toThrow('WALLET_NOT_FOUND');
    });
  });

  describe('CancelRideUseCase: State-Based Cancellation & No-Show Engine', () => {
    it('Free Grace Period: rider cancels within 2 minutes of driver acceptance incurring ₹0 fee', async () => {
      const fixture = setupFixture();
      const { ride } = await createAssignedRide(fixture);

      expect(ride.status).toBe('DRIVER_ASSIGNED');
      const acceptedTime = ride.acceptedAt!;

      // Rider cancels 90 seconds after acceptance (within 2-min grace)
      const cancelTime = new Date(acceptedTime.getTime() + 90 * 1000);
      const result = await fixture.cancelRideUseCase.execute({
        rideId: ride.id,
        actorType: 'RIDER',
        actorId: RIDER_ID,
        reason: 'RIDER_CHANGED_MIND',
        cancelledAt: cancelTime,
      });

      expect(result.ride.status).toBe('CANCELLED');
      expect(result.ride.cancellationReason).toBe('RIDER_CHANGED_MIND');
      expect(result.ride.cancelledAt).toEqual(cancelTime);

      expect(result.feeBreakdown).toEqual({
        totalFeePaise: 0,
        driverCompensationPaise: 0,
        platformFeePaise: 0,
        isGracePeriod: true,
      });

      // Driver wallet is not credited
      const wallet = await fixture.walletRepo.findByDriverId(DRIVER_ID_1);
      expect(wallet?.balancePaise).toBe(250000);

      const events = await fixture.rideEventRepo.findByRideId(ride.id);
      const cancelEvent = events.find((e) => e.eventType === 'RIDE_CANCELLED');
      expect(cancelEvent).toMatchObject({
        actorType: 'RIDER',
        actorId: RIDER_ID,
        newStatus: 'CANCELLED',
        metadata: {
          totalFeePaise: 0,
          isGracePeriod: true,
        },
      });
    });

    it('Late Rider Cancellation: rider cancels after 2-minute grace period incurring flat ₹50 fee with ₹35 driver compensation', async () => {
      const fixture = setupFixture();
      const { ride } = await createAssignedRide(fixture);

      const acceptedTime = ride.acceptedAt!;

      // Rider cancels 3 minutes after acceptance (beyond 2-min grace)
      const cancelTime = new Date(acceptedTime.getTime() + 180 * 1000);
      const result = await fixture.cancelRideUseCase.execute({
        rideId: ride.id,
        actorType: 'RIDER',
        actorId: RIDER_ID,
        reason: 'RIDER_CHANGED_MIND',
        cancelledAt: cancelTime,
      });

      expect(result.ride.status).toBe('CANCELLED');
      expect(result.feeBreakdown).toEqual({
        totalFeePaise: 5000, // ₹50
        driverCompensationPaise: 3500, // ₹35
        platformFeePaise: 1500, // ₹15
        isGracePeriod: false,
      });

      // Driver receives ₹35 compensation credit in prepaid wallet
      const wallet = await fixture.walletRepo.findByDriverId(DRIVER_ID_1);
      expect(wallet?.balancePaise).toBe(250000 + 3500);

      // Verify wallet transaction ledger record
      const transactions = await fixture.walletRepo.findTransactionsByWalletId(driverWallet.id);
      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toMatchObject({
        type: 'CREDIT',
        amountPaise: 3500,
        referenceType: 'CANCELLATION_COMPENSATION',
        referenceId: ride.id,
        balanceBeforePaise: 250000,
        balanceAfterPaise: 253500,
      });

      const events = await fixture.rideEventRepo.findByRideId(ride.id);
      const cancelEvent = events.find((e) => e.eventType === 'RIDE_CANCELLED');
      expect(cancelEvent?.metadata).toMatchObject({
        totalFeePaise: 5000,
        driverCompensationPaise: 3500,
        platformFeePaise: 1500,
        isGracePeriod: false,
      });
    });

    it('Curbside Rider Cancellation: rider cancels while driver is waiting at curb incurring flat ₹50 fee and ₹35 driver credit', async () => {
      const fixture = setupFixture();
      const { ride } = await createAssignedRide(fixture);

      await fixture.driverEnRouteUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
      });

      await fixture.driverArrivedUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
      });

      // Rider cancels after driver arrived at curb
      const result = await fixture.cancelRideUseCase.execute({
        rideId: ride.id,
        actorType: 'RIDER',
        actorId: RIDER_ID,
        reason: 'RIDER_CHANGED_MIND',
      });

      expect(result.ride.status).toBe('CANCELLED');
      expect(result.feeBreakdown.totalFeePaise).toBe(5000);
      expect(result.feeBreakdown.driverCompensationPaise).toBe(3500);

      const wallet = await fixture.walletRepo.findByDriverId(DRIVER_ID_1);
      expect(wallet?.balancePaise).toBe(250000 + 3500);
    });

    it('Driver Cancellation / Emergency: driver cancels resulting in zero fee to rider and no compensation', async () => {
      const fixture = setupFixture();
      const { ride } = await createAssignedRide(fixture);

      await fixture.driverEnRouteUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
      });

      const result = await fixture.cancelRideUseCase.execute({
        rideId: ride.id,
        actorType: 'DRIVER',
        actorId: DRIVER_ID_1,
        reason: 'DRIVER_DELAYED',
      });

      expect(result.ride.status).toBe('CANCELLED');
      expect(result.feeBreakdown).toEqual({
        totalFeePaise: 0,
        driverCompensationPaise: 0,
        platformFeePaise: 0,
        isGracePeriod: false,
      });

      // No wallet credit for driver emergency
      const wallet = await fixture.walletRepo.findByDriverId(DRIVER_ID_1);
      expect(wallet?.balancePaise).toBe(250000);
    });

    it('Curbside No-Show: rejects RIDER_NO_SHOW before 5-minute wait threshold is met', async () => {
      const fixture = setupFixture();
      const { ride } = await createAssignedRide(fixture);

      await fixture.driverEnRouteUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
      });

      const arrivalTime = new Date('2026-09-26T10:00:00.000Z');
      await fixture.driverArrivedUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
        arrivedAt: arrivalTime,
      });

      // Driver attempts no-show after only 3 minutes (180 seconds < 300s required)
      const prematureNoShowTime = new Date(arrivalTime.getTime() + 180 * 1000);
      await expect(
        fixture.cancelRideUseCase.execute({
          rideId: ride.id,
          actorType: 'DRIVER',
          actorId: DRIVER_ID_1,
          reason: 'RIDER_NO_SHOW',
          cancelledAt: prematureNoShowTime,
        }),
      ).rejects.toThrow('MINIMUM_WAIT_TIME_NOT_MET');

      // State remains DRIVER_ARRIVED
      const current = await fixture.rideRepo.findById(ride.id);
      expect(current?.status).toBe('DRIVER_ARRIVED');
    });

    it('Curbside No-Show: allows RIDER_NO_SHOW after 5-minute wait with ₹50 penalty and ₹35 driver compensation', async () => {
      const fixture = setupFixture();
      const { ride } = await createAssignedRide(fixture);

      await fixture.driverEnRouteUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
      });

      const arrivalTime = new Date('2026-09-26T10:00:00.000Z');
      await fixture.driverArrivedUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
        arrivedAt: arrivalTime,
      });

      // Driver waits 5 minutes 30 seconds (330 seconds >= 300s required)
      const validNoShowTime = new Date(arrivalTime.getTime() + 330 * 1000);
      const result = await fixture.cancelRideUseCase.execute({
        rideId: ride.id,
        actorType: 'DRIVER',
        actorId: DRIVER_ID_1,
        reason: 'RIDER_NO_SHOW',
        cancelledAt: validNoShowTime,
      });

      expect(result.ride.status).toBe('CANCELLED');
      expect(result.ride.cancellationReason).toBe('RIDER_NO_SHOW');
      expect(result.feeBreakdown).toEqual({
        totalFeePaise: 5000,
        driverCompensationPaise: 3500,
        platformFeePaise: 1500,
        isGracePeriod: false,
      });

      // Driver receives ₹35 compensation credit
      const wallet = await fixture.walletRepo.findByDriverId(DRIVER_ID_1);
      expect(wallet?.balancePaise).toBe(250000 + 3500);
    });

    it('Curbside No-Show Invalid State: rejects RIDER_NO_SHOW when driver has not arrived at curb', async () => {
      const fixture = setupFixture();
      const { ride } = await createAssignedRide(fixture);

      await fixture.driverEnRouteUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
      });

      // Driver en route cannot claim rider no-show
      await expect(
        fixture.cancelRideUseCase.execute({
          rideId: ride.id,
          actorType: 'DRIVER',
          actorId: DRIVER_ID_1,
          reason: 'RIDER_NO_SHOW',
        }),
      ).rejects.toThrow('INVALID_RIDE_STATE');
    });

    it('Daily Rate-Limiting: rider can cancel up to 5 unassigned rides per day, 6th attempt is blocked', async () => {
      const fixture = setupFixture();
      const today = new Date('2026-09-26T11:00:00.000Z');

      // Create and cancel 5 unassigned rides on the same day
      for (let i = 0; i < 5; i++) {
        const quote = await fixture.quoteUseCase.execute({
          pickup: { lat: 26.71, lng: 88.42 },
          drop: { lat: 26.75, lng: 88.45 },
          vehicleCategory: 'CAB',
          distanceM: 3000,
          durationSeconds: 600,
        });

        const ride = await fixture.createRideUseCase.execute({
          quoteToken: quote.quoteToken,
          proposedFarePaise: quote.suggestedFarePaise,
          riderId: RIDER_ID,
          passengerName: 'Frequent Canceller',
          passengerPhoneE164: '+919876543210',
          pickup: { lat: 26.71, lng: 88.42 },
          drop: { lat: 26.75, lng: 88.45 },
          vehicleCategory: 'CAB',
        });

        const cancelled = await fixture.cancelRideUseCase.execute({
          rideId: ride.id,
          actorType: 'RIDER',
          actorId: RIDER_ID,
          reason: 'RIDER_CHANGED_MIND',
          cancelledAt: today,
        });

        expect(cancelled.ride.status).toBe('CANCELLED');
        expect(cancelled.feeBreakdown.totalFeePaise).toBe(0);
      }

      // Create 6th unassigned ride
      const quote6 = await fixture.quoteUseCase.execute({
        pickup: { lat: 26.71, lng: 88.42 },
        drop: { lat: 26.75, lng: 88.45 },
        vehicleCategory: 'CAB',
        distanceM: 3000,
        durationSeconds: 600,
      });

      const ride6 = await fixture.createRideUseCase.execute({
        quoteToken: quote6.quoteToken,
        proposedFarePaise: quote6.suggestedFarePaise,
        riderId: RIDER_ID,
        passengerName: 'Frequent Canceller',
        passengerPhoneE164: '+919876543210',
        pickup: { lat: 26.71, lng: 88.42 },
        drop: { lat: 26.75, lng: 88.45 },
        vehicleCategory: 'CAB',
      });

      // 6th unassigned cancellation attempt must be blocked
      await expect(
        fixture.cancelRideUseCase.execute({
          rideId: ride6.id,
          actorType: 'RIDER',
          actorId: RIDER_ID,
          reason: 'RIDER_CHANGED_MIND',
          cancelledAt: today,
        }),
      ).rejects.toThrow('RIDER_CANCELLATION_LIMIT_EXCEEDED');
    });

    it('rejects cancellation by unauthorized parties', async () => {
      const fixture = setupFixture();
      const { ride } = await createAssignedRide(fixture);

      // Unauthorized rider
      await expect(
        fixture.cancelRideUseCase.execute({
          rideId: ride.id,
          actorType: 'RIDER',
          actorId: '018f0a00-0000-7000-8000-999999999999',
          reason: 'RIDER_CHANGED_MIND',
        }),
      ).rejects.toThrow('UNAUTHORIZED_RIDER');

      // Unauthorized driver
      await expect(
        fixture.cancelRideUseCase.execute({
          rideId: ride.id,
          actorType: 'DRIVER',
          actorId: DRIVER_ID_2,
          reason: 'DRIVER_DELAYED',
        }),
      ).rejects.toThrow('UNAUTHORIZED_DRIVER');
    });

    it('rejects cancellation from terminal and active trip states', async () => {
      const fixture = setupFixture();
      const { ride } = await createStartedRide(fixture);

      // TRIP_STARTED cannot be cancelled unilaterally
      await expect(
        fixture.cancelRideUseCase.execute({
          rideId: ride.id,
          actorType: 'RIDER',
          actorId: RIDER_ID,
          reason: 'RIDER_CHANGED_MIND',
        }),
      ).rejects.toThrow('INVALID_RIDE_STATE');

      // Complete and settle the ride
      await fixture.completeRideUseCase.execute({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
      });
      await fixture.completeRideUseCase.confirmPayment({
        rideId: ride.id,
        driverId: DRIVER_ID_1,
      });

      // SETTLED cannot be cancelled
      await expect(
        fixture.cancelRideUseCase.execute({
          rideId: ride.id,
          actorType: 'RIDER',
          actorId: RIDER_ID,
          reason: 'RIDER_CHANGED_MIND',
        }),
      ).rejects.toThrow('INVALID_RIDE_STATE');
    });

    it('rejects cancellation when ride does not exist', async () => {
      const fixture = setupFixture();

      await expect(
        fixture.cancelRideUseCase.execute({
          rideId: '018f0a00-0000-7000-8000-999999999999',
          actorType: 'RIDER',
          actorId: RIDER_ID,
          reason: 'RIDER_CHANGED_MIND',
        }),
      ).rejects.toThrow('RIDE_NOT_FOUND');
    });
  });
});


import { unitOfWork } from './helpers/unitOfWork.js';
