import type { GeoPoint, VehicleCategory } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import {
  CreateQuoteUseCase,
  type PricingConfigRepositoryPort,
  type StatePricingRepositoryPort,
} from '../../../pricing/pricing.public.js';
import type { RideEntity, RideRepositoryPort } from '../../domain/index.js';

export interface CreateRideInput {
  quoteToken: string;
  proposedFarePaise: number;
  riderId: string;
  passengerName: string;
  passengerPhoneE164: string;
  pickup: GeoPoint;
  drop: GeoPoint;
  vehicleCategory: VehicleCategory;
}

/** Re-checks the quote's destination state against current settings. Structural: rides must not import stateBoundary. */
export interface QuoteStateVerifier {
  execute(input: {
    destinationStateCode: string | null | undefined;
    routeScope: 'INTRA_STATE' | 'INTERSTATE' | null | undefined;
  }): Promise<void>;
}

export interface CreateRideDeps {
  rideRepo: RideRepositoryPort;
  pricingConfigRepo: PricingConfigRepositoryPort;
  statePricingRepo?: StatePricingRepositoryPort | undefined;
  tokenSecret: string;
  quoteStateVerifier?: QuoteStateVerifier | undefined;
}

export class CreateRideUseCase {
  constructor(private readonly deps: CreateRideDeps) {}

  async execute(input: CreateRideInput): Promise<RideEntity> {
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
    if (!currentConfig || currentConfig.version !== quote.pricingConfigVersion) {
      throw AppError.conflict(
        'PRICING_VERSION_MISMATCH: Pricing configuration has been updated. Please fetch a fresh quote.',
      );
    }

    // 3b. The destination state may have been disabled since the quote was issued.
    await this.deps.quoteStateVerifier?.execute({
      destinationStateCode: quote.destinationStateCode,
      routeScope: quote.routeScope,
    });

    // 3c. Compare current state pricing versions
    if (quote.statePricingVersions && this.deps.statePricingRepo) {
      for (const [stateCode, expectedVer] of Object.entries(quote.statePricingVersions)) {
        const currentSp = await this.deps.statePricingRepo.findByStateCode(stateCode);
        if (!currentSp || currentSp.version !== expectedVer) {
          throw AppError.conflict(
            'PRICING_VERSION_MISMATCH: State pricing has been updated since the quote was issued. Please fetch a fresh quote.',
          );
        }
      }
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
        address: null,
      },
      drop: {
        lat: quote.drop.lat,
        lng: quote.drop.lng,
        address: null,
      },
      routeSnapshot: {
        provider: quote.routeProvider ?? 'GOOGLE_ROUTES',
        distanceM: quote.distanceM,
        durationSeconds: quote.durationSeconds,
        polyline: '',
        calculatedAt: now,
      },
      zoneSnapshot: {
        classification: quote.serviceType,
        cityZoneId: quote.cityZoneId,
        routeScope: quote.routeScope ?? null,
        destinationStateCode: quote.destinationStateCode ?? null,
        stateBoundaryVersion: quote.stateBoundaryVersion ?? null,
        stateConfigVersion: quote.stateConfigVersion ?? null,
        stateSegments: (quote.stateSegments ?? []).map((s) => ({
          stateCode: s.stateCode,
          distanceM: s.distanceM,
          ratePerKmPaise: s.ratePerKmPaise,
        })),
      },
      pricingSnapshot: {
        pricingConfigId: quote.pricingConfigId,
        pricingConfigVersion: quote.pricingConfigVersion,
        vehicleCategory: quote.vehicleCategory,
        baseFarePaise: currentConfig.baseFarePaise,
        ratePerKmPaise: currentConfig.ratePerKmPaise,
        minimumFarePaise: currentConfig.minimumFarePaise,
        includedDistanceM: currentConfig.includedDistanceM,
        bufferSurchargePaise: currentConfig.bufferSurchargePaise,
        negotiationFloorPercent: currentConfig.negotiationFloorPercent,
        negotiationCeilingPercent: currentConfig.negotiationCeilingPercent,
        commissionPercent: currentConfig.commissionPercent,
        zoneType: quote.serviceType,
      },
      suggestedFarePaise: quote.suggestedFarePaise,
      proposedFarePaise: input.proposedFarePaise,
      agreedFarePaise: null,
      status: 'OFFERING',
      cancellationReason: null,
      offeringExpiresAt: new Date(now.getTime() + 90 * 1000), // 90s broadcast window
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

    return this.deps.rideRepo.save(ride);
  }
}
