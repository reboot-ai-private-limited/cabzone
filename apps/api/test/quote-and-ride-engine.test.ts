import { MemoryRideEventRepository } from '../src/modules/rides/index.js';
import { unitOfWork } from './helpers/unitOfWork.js';
import { describe, expect, it } from 'vitest';
import {
  MemoryWalletRepository,
  type WalletEntity,
} from '../src/modules/ledger/index.js';
import {
  calculateBaseFareEstimate,
  CreateQuoteUseCase,
  MemoryPricingConfigRepository,
  type PricingConfigEntity,
} from '../src/modules/pricing/index.js';
import {
  AcceptRideUseCase,
  CreateRideUseCase,
  MemoryRideRepository,
  StartRideUseCase,
} from '../src/modules/rides/index.js';
import {
  MemoryZoneRepository,
  ResolveZonesUseCase,
  ServiceClassificationUseCase,
  type ZoneEntity,
} from '../src/modules/zone/index.js';

describe('Quote Lifecycle & First-to-Accept Ride Engine', () => {
  const TEST_SECRET = 'super-secret-test-token-key-for-quotes-32-chars';

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
    level: 'CITY',
    cityZoneId: siliguriCityZone.id,
    stateCode: null,
    version: 1,
    vehicleType: 'CAB',
    baseFarePaise: 5000, // Rs. 50
    ratePerKmPaise: 1500, // Rs. 15 / km
    minimumFarePaise: 8000, // Rs. 80 min
    outstationBaseFarePaise: 7500, // Rs. 75
    outstationRatePerKmPaise: 2200, // Rs. 22 / km
    outstationMinimumFarePaise: 15000, // Rs. 150 min
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
    driverId: '018f0a00-0000-7000-8000-000000000201',
    balancePaise: 5000, // Rs. 50 (strictly positive)
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const driver2Wallet: WalletEntity = {
    id: '018f0a00-0000-7000-8000-000000000302',
    driverId: '018f0a00-0000-7000-8000-000000000202',
    balancePaise: 10000, // Rs. 100
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const zeroBalanceWallet: WalletEntity = {
    id: '018f0a00-0000-7000-8000-000000000303',
    driverId: '018f0a00-0000-7000-8000-000000000203',
    balancePaise: 0, // Exactly zero
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function setupEngine() {
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
    const walletRepo = new MemoryWalletRepository();
    walletRepo.save(driver1Wallet);
    walletRepo.save(driver2Wallet);
    walletRepo.save(zeroBalanceWallet);

    const createRideUseCase = new CreateRideUseCase({ unitOfWork, rideEventRepo: new MemoryRideEventRepository(),
      rideRepo,
      pricingConfigRepo,
      tokenSecret: TEST_SECRET,
    });

    const acceptRideUseCase = new AcceptRideUseCase({ unitOfWork, rideEventRepo: new MemoryRideEventRepository(),
      requireDriverEligibility: async () => 'test-vehicle',
      rideRepo,
      walletRepo,
      otpTtlMinutes: 20,
    });

    const startRideUseCase = new StartRideUseCase({ unitOfWork, rideEventRepo: new MemoryRideEventRepository(),
      rideRepo,
    });

    return {
      quoteUseCase,
      pricingConfigRepo,
      rideRepo,
      walletRepo,
      createRideUseCase,
      acceptRideUseCase,
      startRideUseCase,
    };
  }

  it('generates a 5-minute quote bound to exact trip parameters and signed with HMAC', async () => {
    const { quoteUseCase } = setupEngine();

    const quote = await quoteUseCase.execute({
      pickup: { lat: 26.72, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
      vehicleCategory: 'CAB',
    });

    expect(quote.quoteId).toBeDefined();
    expect(quote.suggestedFarePaise).toBeGreaterThanOrEqual(cabPricingConfig.minimumFarePaise);
    expect(quote.negotiation.floorPaise).toBeLessThanOrEqual(quote.suggestedFarePaise);
    expect(quote.negotiation.ceilingPaise).toBeGreaterThanOrEqual(quote.suggestedFarePaise);
    expect(quote.quoteToken).toContain('.');

    // Verify token can be verified
    const payload = CreateQuoteUseCase.verifyQuoteToken(quote.quoteToken, TEST_SECRET);
    expect(payload.quoteId).toBe(quote.quoteId);
    expect(payload.suggestedFarePaise).toBe(quote.suggestedFarePaise);
    expect(payload.pickup.lat).toBe(26.72);
    expect(payload.drop.lat).toBe(26.75);
    expect(payload.vehicleCategory).toBe('CAB');
  });

  it('rejects expired quotes (5-minute TTL)', async () => {
    const { quoteUseCase } = setupEngine();

    const quote = await quoteUseCase.execute({
      pickup: { lat: 26.72, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
      vehicleCategory: 'CAB',
    });

    // Fast-forward 6 minutes
    const futureTime = new Date(Date.now() + 360 * 1000);

    expect(() =>
      CreateQuoteUseCase.verifyQuoteToken(quote.quoteToken, TEST_SECRET, futureTime),
    ).toThrow('QUOTE_EXPIRED');
  });

  it('rejects ride creation when trip parameters do not match signed quote', async () => {
    const { quoteUseCase, createRideUseCase } = setupEngine();

    const quote = await quoteUseCase.execute({
      pickup: { lat: 26.72, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
      vehicleCategory: 'CAB',
    });

    // Attempting to use quote for a different destination
    await expect(
      createRideUseCase.execute({
        quoteToken: quote.quoteToken,
        proposedFarePaise: quote.suggestedFarePaise,
        riderId: '018f0a00-0000-7000-8000-000000000101',
        passengerName: 'Jane Rider',
        passengerPhoneE164: '+919876543210',
        pickup: { lat: 26.72, lng: 88.42 },
        drop: { lat: 26.90, lng: 88.60 }, // Modified destination!
        vehicleCategory: 'CAB',
      }),
    ).rejects.toThrow('QUOTE_MISMATCH');

    // Attempting to use quote for a different vehicle category
    await expect(
      createRideUseCase.execute({
        quoteToken: quote.quoteToken,
        proposedFarePaise: quote.suggestedFarePaise,
        riderId: '018f0a00-0000-7000-8000-000000000101',
        passengerName: 'Jane Rider',
        passengerPhoneE164: '+919876543210',
        pickup: { lat: 26.72, lng: 88.42 },
        drop: { lat: 26.75, lng: 88.45 },
        vehicleCategory: 'MOTO', // Different vehicle!
      }),
    ).rejects.toThrow('QUOTE_MISMATCH');
  });

  it('creates ride when proposed fare is within bounds and matches quote binding', async () => {
    const { quoteUseCase, createRideUseCase } = setupEngine();

    const quote = await quoteUseCase.execute({
      pickup: { lat: 26.72, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
      vehicleCategory: 'CAB',
    });

    const ride = await createRideUseCase.execute({
      quoteToken: quote.quoteToken,
      proposedFarePaise: quote.suggestedFarePaise,
      riderId: '018f0a00-0000-7000-8000-000000000101',
      passengerName: 'Jane Rider',
      passengerPhoneE164: '+919876543210',
      pickup: { lat: 26.72, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
      vehicleCategory: 'CAB',
    });

    expect(ride.id).toBeDefined();
    expect(ride.status).toBe('OFFERING');
    expect(ride.driverId).toBeNull();
    expect(ride.proposedFarePaise).toBe(quote.suggestedFarePaise);
    expect(ride.suggestedFarePaise).toBe(quote.suggestedFarePaise);
    expect(ride.pricingSnapshot.pricingConfigVersion).toBe(cabPricingConfig.version);
  });

  it('rejects proposed fare below negotiation floor or above ceiling', async () => {
    const { quoteUseCase, createRideUseCase } = setupEngine();

    const quote = await quoteUseCase.execute({
      pickup: { lat: 26.72, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
      vehicleCategory: 'CAB',
    });

    // Too low
    await expect(
      createRideUseCase.execute({
        quoteToken: quote.quoteToken,
        proposedFarePaise: quote.negotiation.floorPaise - 100,
        riderId: '018f0a00-0000-7000-8000-000000000101',
        passengerName: 'Jane Rider',
        passengerPhoneE164: '+919876543210',
        pickup: { lat: 26.72, lng: 88.42 },
        drop: { lat: 26.75, lng: 88.45 },
        vehicleCategory: 'CAB',
      }),
    ).rejects.toThrow('FARE_OUTSIDE_NEGOTIATION_LIMIT');

    // Too high
    await expect(
      createRideUseCase.execute({
        quoteToken: quote.quoteToken,
        proposedFarePaise: quote.negotiation.ceilingPaise + 100,
        riderId: '018f0a00-0000-7000-8000-000000000101',
        passengerName: 'Jane Rider',
        passengerPhoneE164: '+919876543210',
        pickup: { lat: 26.72, lng: 88.42 },
        drop: { lat: 26.75, lng: 88.45 },
        vehicleCategory: 'CAB',
      }),
    ).rejects.toThrow('FARE_OUTSIDE_NEGOTIATION_LIMIT');
  });

  it('rejects stale quote if pricing config version has changed', async () => {
    const { quoteUseCase, pricingConfigRepo, createRideUseCase } = setupEngine();

    const quote = await quoteUseCase.execute({
      pickup: { lat: 26.72, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
      vehicleCategory: 'CAB',
    });

    // Pricing configuration gets updated to version 2
    await pricingConfigRepo.save({
      ...cabPricingConfig,
      version: 2,
      baseFarePaise: 6000,
    });

    await expect(
      createRideUseCase.execute({
        quoteToken: quote.quoteToken,
        proposedFarePaise: quote.suggestedFarePaise,
        riderId: '018f0a00-0000-7000-8000-000000000101',
        passengerName: 'Jane Rider',
        passengerPhoneE164: '+919876543210',
        pickup: { lat: 26.72, lng: 88.42 },
        drop: { lat: 26.75, lng: 88.45 },
        vehicleCategory: 'CAB',
      }),
    ).rejects.toThrow('PRICING_VERSION_MISMATCH');
  });

  it('enforces server-authoritative driver wallet balance > 0 gate on ride accept (D-008, D-036)', async () => {
    const { quoteUseCase, createRideUseCase, acceptRideUseCase } = setupEngine();

    const quote = await quoteUseCase.execute({
      pickup: { lat: 26.72, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
      vehicleCategory: 'CAB',
    });

    const ride = await createRideUseCase.execute({
      quoteToken: quote.quoteToken,
      proposedFarePaise: quote.suggestedFarePaise,
      riderId: '018f0a00-0000-7000-8000-000000000101',
      passengerName: 'Jane Rider',
      passengerPhoneE164: '+919876543210',
      pickup: { lat: 26.72, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
      vehicleCategory: 'CAB',
    });

    // Driver with zero wallet balance (authoritative lookup rejects)
    await expect(
      acceptRideUseCase.execute({
        rideId: ride.id,
        driverId: '018f0a00-0000-7000-8000-000000000203', // driver with 0 balance
      }),
    ).rejects.toThrow('DRIVER_WALLET_ZERO_BALANCE');

    // Non-existent wallet rejected
    await expect(
      acceptRideUseCase.execute({
        rideId: ride.id,
        driverId: '018f0a00-0000-7000-8000-000000000999', // no wallet
      }),
    ).rejects.toThrow('DRIVER_WALLET_ZERO_BALANCE');
  });

  it('guarantees atomic first-to-accept with secure 4-digit pickup OTP', async () => {
    const { quoteUseCase, createRideUseCase, acceptRideUseCase } = setupEngine();

    const quote = await quoteUseCase.execute({
      pickup: { lat: 26.72, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
      vehicleCategory: 'CAB',
    });

    const ride = await createRideUseCase.execute({
      quoteToken: quote.quoteToken,
      proposedFarePaise: quote.suggestedFarePaise,
      riderId: '018f0a00-0000-7000-8000-000000000101',
      passengerName: 'Jane Rider',
      passengerPhoneE164: '+919876543210',
      pickup: { lat: 26.72, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
      vehicleCategory: 'CAB',
    });

    // Driver 1 accepts first (wins)
    const acceptResult1 = await acceptRideUseCase.execute({
      rideId: ride.id,
      driverId: '018f0a00-0000-7000-8000-000000000201',
    });

    expect(acceptResult1.ride.driverId).toBe('018f0a00-0000-7000-8000-000000000201');
    expect(acceptResult1.ride.status).toBe('DRIVER_ASSIGNED');
    expect(acceptResult1.ride.agreedFarePaise).toBe(quote.suggestedFarePaise);
    expect(acceptResult1.ride.passenger.pickupOtpHash).toBeDefined();
    expect(acceptResult1.ride.passenger.pickupOtpExpiresAt).toBeInstanceOf(Date);
    expect(acceptResult1._riderPickupOtp).toMatch(/^[1-9]\d{3}$/); // Cryptographically secure 4-digit OTP

    // Driver 2 tries to accept the already assigned ride (loses)
    await expect(
      acceptRideUseCase.execute({
        rideId: ride.id,
        driverId: '018f0a00-0000-7000-8000-000000000202',
      }),
    ).rejects.toThrow('RIDE_UNAVAILABLE');
  });

  it('enforces strict DRIVER_ARRIVED lifecycle state before OTP verification starts trip', async () => {
    const { quoteUseCase, createRideUseCase, acceptRideUseCase, startRideUseCase, rideRepo } =
      setupEngine();

    const quote = await quoteUseCase.execute({
      pickup: { lat: 26.72, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
      vehicleCategory: 'CAB',
    });

    const ride = await createRideUseCase.execute({
      quoteToken: quote.quoteToken,
      proposedFarePaise: quote.suggestedFarePaise,
      riderId: '018f0a00-0000-7000-8000-000000000101',
      passengerName: 'Jane Rider',
      passengerPhoneE164: '+919876543210',
      pickup: { lat: 26.72, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
      vehicleCategory: 'CAB',
    });

    const driverId = '018f0a00-0000-7000-8000-000000000201';
    const { _riderPickupOtp } = await acceptRideUseCase.execute({
      rideId: ride.id,
      driverId,
    });
    const pickupOtp = _riderPickupOtp!;

    // Cannot start trip while still in DRIVER_ASSIGNED state (must be DRIVER_ARRIVED!)
    await expect(
      startRideUseCase.execute({
        rideId: ride.id,
        driverId,
        otp: pickupOtp,
      }),
    ).rejects.toThrow('INVALID_RIDE_STATE');

    // Simulate driver arrival
    const assignedRide = await rideRepo.findById(ride.id);
    await rideRepo.save({
      ...assignedRide!,
      status: 'DRIVER_ARRIVED',
      arrivedAt: new Date(),
    });

    // Unauthorized driver cannot start
    await expect(
      startRideUseCase.execute({
        rideId: ride.id,
        driverId: '018f0a00-0000-7000-8000-000000000299',
        otp: pickupOtp,
      }),
    ).rejects.toThrow('UNAUTHORIZED_DRIVER');

    // Incorrect OTP rejected
    await expect(
      startRideUseCase.execute({
        rideId: ride.id,
        driverId,
        otp: '0000',
      }),
    ).rejects.toThrow('INVALID_PICKUP_OTP');

    // Correct OTP starts trip successfully
    const startedRide = await startRideUseCase.execute({
      rideId: ride.id,
      driverId,
      otp: pickupOtp,
    });

    expect(startedRide.status).toBe('TRIP_STARTED');
    expect(startedRide.startedAt).toBeInstanceOf(Date);
  });

  describe('IN_CITY boundary logic in pickup-drop-pricing', () => {
    it('prices a pickup+drop both inside the city zone as CITY, no buffer surcharge', async () => {
      const { quoteUseCase } = setupEngine();

      const quote = await quoteUseCase.execute({
        pickup: { lat: 26.72, lng: 88.42 },
        drop: { lat: 26.75, lng: 88.45 }, // both inside the Siliguri polygon [88.4-88.5, 26.7-26.8]
        vehicleCategory: 'CAB',
      });

      // QuoteDto.serviceType carries classification.type (IN_CITY/OUTSTATION/INTERSTATE),
      // not the collapsed CITY/OUTSTATION ClassifiedServiceType.
      expect(quote.serviceType).toBe('IN_CITY');
      expect(quote.bufferApplied).toBe(false);
      expect(quote.routeScope).toBeNull();
      expect(quote.destinationStateCode).toBeNull();
      expect(quote.cityName).toBe('Siliguri City');

      // Pricing formula invariant: the fare returned must match calculateBaseFareEstimate
      // applied to the config and distance the classifier/router actually resolved.
      const expectedFare = calculateBaseFareEstimate({
        config: cabPricingConfig,
        distanceM: quote.distanceM,
        serviceType: 'CITY',
        isBufferFallback: false,
      });
      expect(quote.suggestedFarePaise).toBe(expectedFare);
    });

    it('prices a drop just outside the city boundary but within the buffer as CITY, with buffer surcharge applied', async () => {
      const { quoteUseCase } = setupEngine();

      const quote = await quoteUseCase.execute({
        // Pickup inside the zone; drop ~4km past the north edge (26.80) -> outside the polygon
        // but well within the 25km buffer configured on the zone.
        pickup: { lat: 26.75, lng: 88.45 },
        drop: { lat: 26.84, lng: 88.45 },
        vehicleCategory: 'CAB',
      });

      expect(quote.serviceType).toBe('IN_CITY');
      expect(quote.bufferApplied).toBe(true);
      expect(quote.routeScope).toBeNull();

      const expectedFare = calculateBaseFareEstimate({
        config: cabPricingConfig,
        distanceM: quote.distanceM,
        serviceType: 'CITY',
        isBufferFallback: true,
      });
      expect(quote.suggestedFarePaise).toBe(expectedFare);
      // The buffer surcharge must actually land in the fare vs. the no-buffer formula.
      const noBufferFare = calculateBaseFareEstimate({
        config: cabPricingConfig,
        distanceM: quote.distanceM,
        serviceType: 'CITY',
        isBufferFallback: false,
      });
      expect(expectedFare).toBe(noBufferFare + cabPricingConfig.bufferSurchargePaise);
    });

    it('classifies a drop beyond the buffer as OUTSTATION, not CITY', async () => {
      const { quoteUseCase } = setupEngine();

      const quote = await quoteUseCase.execute({
        pickup: { lat: 26.75, lng: 88.45 },
        drop: { lat: 27.5, lng: 88.45 }, // ~100km away, well outside the 25km buffer
        vehicleCategory: 'CAB',
      });

      expect(quote.serviceType).toBe('OUTSTATION');
      expect(quote.bufferApplied).toBe(false);

      // Priced using the outstation tier of the active config
      const expectedFare = calculateBaseFareEstimate({
        config: cabPricingConfig,
        distanceM: quote.distanceM,
        serviceType: 'OUTSTATION',
        isBufferFallback: false,
      });
      expect(quote.suggestedFarePaise).toBe(expectedFare);

      // Confirm it genuinely used the outstation tier, not the city tier
      const cityFareSameDistance = calculateBaseFareEstimate({
        config: cabPricingConfig,
        distanceM: quote.distanceM,
        serviceType: 'CITY',
        isBufferFallback: false,
      });
      expect(expectedFare).not.toBe(cityFareSameDistance);
    });

    it('serves suburban pickup outside city polygon but within buffer as IN_CITY with buffer surcharge', async () => {
      const { quoteUseCase } = setupEngine();

      const quote = await quoteUseCase.execute({
        pickup: { lat: 26.82, lng: 88.45 }, // ~2.2km outside Siliguri city polygon, within 20km buffer
        drop: { lat: 26.75, lng: 88.45 }, // Inside Siliguri city
        vehicleCategory: 'CAB',
      });

      expect(quote.serviceType).toBe('IN_CITY');
      expect(quote.cityZoneId).toBe(siliguriCityZone.id);
      expect(quote.cityName).toBe(siliguriCityZone.name);
      expect(quote.bufferApplied).toBe(true);

      const expectedFare = calculateBaseFareEstimate({
        config: cabPricingConfig,
        distanceM: quote.distanceM,
        serviceType: 'CITY',
        isBufferFallback: true,
      });
      expect(quote.suggestedFarePaise).toBe(expectedFare);
    });

    it('serves pickup far outside every active zone by falling back to nearest zone as OUTSTATION', async () => {
      const { quoteUseCase } = setupEngine();

      const quote = await quoteUseCase.execute({
        pickup: { lat: 20.0, lng: 78.0 }, // far from any registered zone or its buffer, inside India
        drop: { lat: 20.1, lng: 78.1 },
        vehicleCategory: 'CAB',
      });

      expect(quote.serviceType).toBe('OUTSTATION');
      expect(quote.cityZoneId).toBe(siliguriCityZone.id);
      expect(quote.cityName).toBe(siliguriCityZone.name);
      expect(quote.bufferApplied).toBe(false);

      const expectedFare = calculateBaseFareEstimate({
        config: cabPricingConfig,
        distanceM: quote.distanceM,
        serviceType: 'OUTSTATION',
        isBufferFallback: false,
      });
      expect(quote.suggestedFarePaise).toBe(expectedFare);
    });

    it('rejects quote creation with NO_ACTIVE_ZONE only when zero active city zones exist system-wide', async () => {
      const emptyZoneRepo = new MemoryZoneRepository();
      const resolveZonesUseCase = new ResolveZonesUseCase({ zoneRepo: emptyZoneRepo });
      const serviceClassificationUseCase = new ServiceClassificationUseCase({ resolveZonesUseCase });
      const pricingConfigRepo = new MemoryPricingConfigRepository();

      const quoteUseCase = new CreateQuoteUseCase({
        serviceClassificationUseCase,
        pricingConfigRepo,
        tokenSecret: TEST_SECRET,
      });

      await expect(
        quoteUseCase.execute({
          pickup: { lat: 26.72, lng: 88.42 },
          drop: { lat: 26.75, lng: 88.45 },
          vehicleCategory: 'CAB',
        }),
      ).rejects.toThrow('NO_ACTIVE_ZONE');
    });
  });

  it('locks out OTP verification after maximum attempts (3)', async () => {
    const { quoteUseCase, createRideUseCase, acceptRideUseCase, startRideUseCase, rideRepo } =
      setupEngine();

    const quote = await quoteUseCase.execute({
      pickup: { lat: 26.72, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
      vehicleCategory: 'CAB',
    });

    const ride = await createRideUseCase.execute({
      quoteToken: quote.quoteToken,
      proposedFarePaise: quote.suggestedFarePaise,
      riderId: '018f0a00-0000-7000-8000-000000000101',
      passengerName: 'Jane Rider',
      passengerPhoneE164: '+919876543210',
      pickup: { lat: 26.72, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
      vehicleCategory: 'CAB',
    });

    const driverId = '018f0a00-0000-7000-8000-000000000201';
    await acceptRideUseCase.execute({
      rideId: ride.id,
      driverId,
    });

    const assignedRide = await rideRepo.findById(ride.id);
    await rideRepo.save({
      ...assignedRide!,
      status: 'DRIVER_ARRIVED',
    });

    // Attempt 1: fail
    await expect(
      startRideUseCase.execute({ rideId: ride.id, driverId, otp: '1111' }),
    ).rejects.toThrow('INVALID_PICKUP_OTP');

    // Attempt 2: fail
    await expect(
      startRideUseCase.execute({ rideId: ride.id, driverId, otp: '2222' }),
    ).rejects.toThrow('INVALID_PICKUP_OTP');

    // Attempt 3: lockout triggered
    await expect(
      startRideUseCase.execute({ rideId: ride.id, driverId, otp: '3333' }),
    ).rejects.toThrow('OTP_LOCKOUT');

    // Subsequent attempt is blocked by lockout
    await expect(
      startRideUseCase.execute({ rideId: ride.id, driverId, otp: '1234' }),
    ).rejects.toThrow('OTP_LOCKOUT');
  });
});
