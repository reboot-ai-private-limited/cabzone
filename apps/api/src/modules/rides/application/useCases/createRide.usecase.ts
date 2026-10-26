import type { GeoPoint, VehicleCategory } from '@cabzone/contracts';
import { isPointInIndia } from '@cabzone/geo';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import {
  CreateQuoteUseCase,
  type PricingConfigRepositoryPort,
} from '../../../pricing/pricing.public.js';
import type {
  RideEntity,
  RideRepositoryPort,
  RideEventRepositoryPort,
} from '../../domain/index.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';

export interface CreateRideInput {
  quoteToken: string;
  proposedFarePaise: number;
  riderId: string;
  passengerName: string;
  passengerPhoneE164: string;
  pickup: GeoPoint & { address?: string | null | undefined };
  drop: GeoPoint & { address?: string | null | undefined };
  vehicleCategory: VehicleCategory;
}

export interface CreateRideDeps {
  unitOfWork: UnitOfWorkPort;
  rideEventRepo: RideEventRepositoryPort;
  rideRepo: RideRepositoryPort;
  pricingConfigRepo: PricingConfigRepositoryPort;
  tokenSecret: string;
}

export class CreateRideUseCase {
  constructor(private readonly deps: CreateRideDeps) {}

  async execute(input: CreateRideInput): Promise<RideEntity> {
    return this.deps.unitOfWork.run(() => this.create(input));
  }

  private async create(input: CreateRideInput): Promise<RideEntity> {
    // 0. Sovereign Domestic Boundary Restriction: strictly within India
    const pickupCheck = isPointInIndia(input.pickup);
    if (!pickupCheck.inside) {
      throw AppError.badRequest(
        `OUTSIDE_INDIA: Pickup location must be within India. ${pickupCheck.reason ?? 'Cabzone operates strictly within Indian sovereign territory.'}`,
      );
    }
    const dropCheck = isPointInIndia(input.drop);
    if (!dropCheck.inside) {
      throw AppError.badRequest(
        `OUTSIDE_INDIA: Drop location must be within India. ${dropCheck.reason ?? 'Cross-border trips are strictly prohibited.'}`,
      );
    }

    // 1. Verify quote token signature and 5-minute TTL
    const quote = CreateQuoteUseCase.verifyQuoteToken(input.quoteToken, this.deps.tokenSecret);

    // 2. Exact quote-to-trip binding check
    if (
      quote.pickup.lat !== input.pickup.lat ||
      quote.pickup.lng !== input.pickup.lng ||
      quote.drop.lat !== input.drop.lat ||
      quote.drop.lng !== input.drop.lng ||
      quote.vehicleCategory !== input.vehicleCategory
    ) {
      throw AppError.badRequest(
        'QUOTE_MISMATCH: Ride parameters (pickup, drop, or vehicleCategory) do not match the signed quote.',
      );
    }

    // 3. Stale quote prevention: check pricing config version
    const currentConfig = await this.deps.pricingConfigRepo.findById(quote.pricingConfigId);
    const effectiveConfig = await this.deps.pricingConfigRepo.findEffectiveConfig(
      { cityZoneId: quote.cityZoneId, stateCode: quote.originStateCode },
      quote.vehicleCategory,
    );
    if (
      !currentConfig ||
      currentConfig.version !== quote.pricingConfigVersion ||
      effectiveConfig?.id !== currentConfig.id
    ) {
      throw AppError.conflict(
        'PRICING_VERSION_MISMATCH: Pricing configuration has been updated. Please fetch a fresh quote.',
      );
    }
    for (const state of quote.statePricingVersions ?? []) {
      const config = await this.deps.pricingConfigRepo.findEffectiveConfigByState(
        state.stateCode,
        quote.vehicleCategory,
      );
      if (config?.id !== state.configId || config.version !== state.version)
        throw AppError.conflict(
          'PRICING_VERSION_MISMATCH: State pricing changed. Please fetch a fresh quote.',
        );
    }

    // 4. Validate rider proposed fare against server negotiation bounds
    if (
      input.proposedFarePaise < quote.floorPaise ||
      input.proposedFarePaise > quote.ceilingPaise
    ) {
      throw AppError.badRequest(
        `FARE_OUTSIDE_NEGOTIATION_LIMIT: Proposed fare ${input.proposedFarePaise} is outside allowed bounds [${quote.floorPaise}, ${quote.ceilingPaise}].`,
      );
    }

    const now = new Date();
    const rideId = newUuid();

    const ride: RideEntity = {
      id: rideId,
      bookerRiderId: input.riderId,
      passenger: {
        riderId: input.riderId,
        name: input.passengerName,
        phoneE164: input.passengerPhoneE164,
        pickupOtpHash: null,
        pickupOtpExpiresAt: null,
        otpAttempts: 0,
        maxOtpAttempts: 3,
      },
      driverId: null,
      vehicleId: null,
      vehicleCategory: quote.vehicleCategory,
      pickup: {
        lat: quote.pickup.lat,
        lng: quote.pickup.lng,
        address: input.pickup.address ?? null,
      },
      drop: {
        lat: quote.drop.lat,
        lng: quote.drop.lng,
        address: input.drop.address ?? null,
      },
      routeSnapshot: {
        provider: quote.routeProvider ?? 'GOOGLE_ROUTES',
        distanceM: quote.distanceM,
        durationSeconds: quote.durationSeconds,
        polyline: quote.polyline ?? '',
        calculatedAt: now,
      },
      zoneSnapshot: {
        classification: quote.serviceType,
        cityZoneId: quote.cityZoneId,
        routeScope: quote.routeScope ?? null,
        destinationStateCode: quote.destinationStateCode ?? null,
      },
      pricingSnapshot: {
        pricingConfigId: quote.pricingConfigId,
        pricingConfigVersion: quote.pricingConfigVersion,
        vehicleCategory: quote.vehicleCategory,
        baseFarePaise:
          quote.serviceType === 'OUTSTATION' || quote.serviceType === 'INTERSTATE'
            ? currentConfig.outstationBaseFarePaise
            : currentConfig.baseFarePaise,
        ratePerKmPaise:
          quote.serviceType === 'OUTSTATION' || quote.serviceType === 'INTERSTATE'
            ? currentConfig.outstationRatePerKmPaise
            : currentConfig.ratePerKmPaise,
        minimumFarePaise:
          quote.serviceType === 'OUTSTATION' || quote.serviceType === 'INTERSTATE'
            ? currentConfig.outstationMinimumFarePaise
            : currentConfig.minimumFarePaise,
        bufferSurchargePaise: currentConfig.bufferSurchargePaise,
        negotiationFloorPercent: currentConfig.negotiationFloorPercent,
        negotiationCeilingPercent: currentConfig.negotiationCeilingPercent,
        commissionPercent: currentConfig.commissionPercent,
        zoneType: quote.serviceType,
        stateBreakdown: quote.stateBreakdown ?? [],
        statePricingVersions: quote.statePricingVersions ?? [],
      },
      suggestedFarePaise: quote.suggestedFarePaise,
      proposedFarePaise: input.proposedFarePaise,
      agreedFarePaise: null,
      status: 'OFFERING',
      cancellationReason: null,
      offeringExpiresAt: new Date(now.getTime() + currentConfig.negotiationWindowSeconds * 1000),
      acceptedAt: null,
      arrivedAt: null,
      startedAt: null,
      completedAt: null,
      settledAt: null,
      cancelledAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.deps.rideRepo.save(ride);
    await this.deps.rideEventRepo.save({
      id: newUuid(),
      rideId: saved.id,
      eventType: 'RIDE_CREATED',
      actorType: 'RIDER',
      actorId: input.riderId,
      previousStatus: null,
      newStatus: saved.status,
      metadata: { quoteId: quote.quoteId },
      createdAt: now,
    });
    return saved;
  }
}
