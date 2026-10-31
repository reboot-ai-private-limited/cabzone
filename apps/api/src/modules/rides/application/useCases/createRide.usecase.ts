import {
  type ActiveRideConflictDetailsDto,
  type GeoPoint,
  type PaymentMethod,
  type VehicleCategory,
} from '@cabzone/contracts';
import { isPointInIndia } from '@cabzone/geo';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import {
  getRiderUnpaidArrearsPaise,
  type WalletRepositoryPort,
} from '../../../ledger/ledger.public.js';
import {
  CreateQuoteUseCase,
  resolveCancellationPolicy,
  type PricingConfigRepositoryPort,
} from '../../../pricing/pricing.public.js';
import type {
  RideEntity,
  RideRepositoryPort,
  RideEventRepositoryPort,
} from '../../domain/index.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';

const IDEMPOTENCY_KEY_REGEX = /^[a-zA-Z0-9:_-]{8,128}$/;

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

function activeRideConflictError(existing: Pick<RideEntity, 'id' | 'status'>): AppError {
  const details: ActiveRideConflictDetailsDto = {
    code: 'ACTIVE_RIDE_EXISTS',
    rideId: existing.id,
    status: existing.status,
    ridePath: `/api/v1/rides/${existing.id}`,
  };
  return AppError.conflict('ACTIVE_RIDE_EXISTS: Rider already has an active ride.', details);
}

export interface CreateRideInput {
  quoteToken: string;
  proposedFarePaise: number;
  riderId: string;
  passengerName: string;
  passengerPhoneE164: string;
  pickup: GeoPoint & { address?: string | null | undefined };
  drop: GeoPoint & { address?: string | null | undefined };
  vehicleCategory: VehicleCategory;
  idempotencyKey?: string | undefined;
  paymentMethod?: PaymentMethod | undefined;
}

export interface CreateRideResult {
  ride: RideEntity;
  replayed: boolean;
}

export interface CreateRideDeps {
  unitOfWork: UnitOfWorkPort;
  rideEventRepo: RideEventRepositoryPort;
  rideRepo: RideRepositoryPort;
  pricingConfigRepo: PricingConfigRepositoryPort;
  walletRepo?: WalletRepositoryPort | undefined;
  tokenSecret: string;
}

export class CreateRideUseCase {
  constructor(private readonly deps: CreateRideDeps) {}

  async execute(input: CreateRideInput): Promise<RideEntity> {
    return (await this.executeWithMeta(input)).ride;
  }

  async executeWithMeta(input: CreateRideInput): Promise<CreateRideResult> {
    const idempotencyKey = input.idempotencyKey?.trim() || null;
    if (idempotencyKey !== null && !IDEMPOTENCY_KEY_REGEX.test(idempotencyKey)) {
      throw AppError.badRequest(
        'INVALID_IDEMPOTENCY_KEY: idempotencyKey must be 8-128 alphanumeric, :, _, or - characters.',
      );
    }

    await this.deps.rideRepo.ensureReady?.();

    try {
      return await this.deps.unitOfWork.run(() => this.create(input, idempotencyKey));
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      if (idempotencyKey) {
        const replay = await this.deps.rideRepo.findByBookerIdempotencyKey(
          input.riderId,
          idempotencyKey,
        );
        if (replay) {
          this.assertMatchingIdempotentReplay(replay, input);
          return { ride: replay, replayed: true };
        }
      }
      const existingActive = await this.deps.rideRepo.findActiveByBookerRiderId(input.riderId);
      if (existingActive) {
        throw activeRideConflictError(existingActive);
      }
      throw AppError.conflict('ACTIVE_RIDE_EXISTS: Rider already has an active ride.', {
        code: 'ACTIVE_RIDE_EXISTS',
      });
    }
  }

  private assertMatchingIdempotentReplay(existing: RideEntity, input: CreateRideInput): void {
    const matches =
      existing.pickup.lat === input.pickup.lat &&
      existing.pickup.lng === input.pickup.lng &&
      (existing.pickup.address ?? null) === (input.pickup.address ?? null) &&
      existing.drop.lat === input.drop.lat &&
      existing.drop.lng === input.drop.lng &&
      (existing.drop.address ?? null) === (input.drop.address ?? null) &&
      existing.vehicleCategory === input.vehicleCategory &&
      existing.passenger.name === input.passengerName &&
      existing.passenger.phoneE164 === input.passengerPhoneE164 &&
      (existing.version !== 1 || existing.proposedFarePaise === input.proposedFarePaise);
    if (!matches) {
      throw AppError.conflict(
        'IDEMPOTENCY_KEY_REUSED: Idempotency key belongs to a ride request with different parameters.',
        { code: 'IDEMPOTENCY_KEY_REUSED' },
      );
    }
  }

  private async create(
    input: CreateRideInput,
    idempotencyKey: string | null,
  ): Promise<CreateRideResult> {
    if (idempotencyKey) {
      const existingByKey = await this.deps.rideRepo.findByBookerIdempotencyKey(
        input.riderId,
        idempotencyKey,
      );
      if (existingByKey) {
        this.assertMatchingIdempotentReplay(existingByKey, input);
        return { ride: existingByKey, replayed: true };
      }
    }

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
      if (config?.id !== state.configId || config.version !== state.version) {
        throw AppError.conflict(
          'PRICING_VERSION_MISMATCH: State pricing changed. Please fetch a fresh quote.',
        );
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

    // 5. Enforce one active or unpaid ride per booker rider (Decision D-043)
    const existingActive = await this.deps.rideRepo.findActiveByBookerRiderId(input.riderId);
    if (existingActive) {
      throw activeRideConflictError(existingActive);
    }
    const existingUnpaid = (
      await this.deps.rideRepo.list({
        riderId: input.riderId,
        statuses: ['PAYMENT_UNPAID'],
        limit: 1,
        offset: 0,
      })
    )[0];
    if (existingUnpaid) {
      throw activeRideConflictError(existingUnpaid);
    }

    // 6. Resolve cancellation policy & live unpaid rider arrears (D-044)
    const cancellationPolicy = resolveCancellationPolicy(currentConfig);
    const riderWallet = this.deps.walletRepo
      ? await this.deps.walletRepo.findByRiderId(input.riderId)
      : null;
    const arrearsPaise = getRiderUnpaidArrearsPaise(riderWallet);

    const now = new Date();
    const rideId = newUuid();

    const ride: RideEntity = {
      tollSnapshot: quote.tollSnapshot ?? null,
      id: rideId,
      bookerRiderId: input.riderId,
      idempotencyKey,
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
        extensionTariffs: {
          originStateCode: quote.originStateCode ?? quote.stateBreakdown?.[0]?.stateCode ?? null,
          outstationRatePerKmPaise: currentConfig.outstationRatePerKmPaise,
          stateRates: Object.fromEntries(
            (quote.stateBreakdown ?? []).map((s) => [
              s.stateCode,
              s.ratePerKmPaise ?? currentConfig.outstationRatePerKmPaise,
            ]),
          ),
        },
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
        cancellationFeePaise: cancellationPolicy.cancellationFeePaise,
        driverCompensationPaise: cancellationPolicy.driverCompensationPaise,
        platformCancellationFeePaise: cancellationPolicy.platformCancellationFeePaise,
        riderCancellationGraceSeconds: cancellationPolicy.riderCancellationGraceSeconds,
        driverNoShowWaitSeconds: cancellationPolicy.driverNoShowWaitSeconds,
        zoneType: quote.serviceType,
        stateBreakdown: quote.stateBreakdown ?? [],
        statePricingVersions: quote.statePricingVersions ?? [],
      },
      suggestedFarePaise: quote.suggestedFarePaise,
      proposedFarePaise: input.proposedFarePaise,
      agreedFarePaise: null,
      arrearsPaise,
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

    const saved = await this.deps.rideRepo.create(ride);
    await this.deps.rideEventRepo.save({
      id: newUuid(),
      rideId: saved.id,
      eventType: 'RIDE_CREATED',
      actorType: 'RIDER',
      actorId: input.riderId,
      previousStatus: null,
      newStatus: saved.status,
      metadata: {
        quoteId: quote.quoteId,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        arrearsPaise,
        ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
      },
      createdAt: now,
    });
    if (input.paymentMethod === 'CASH') {
      await this.deps.rideEventRepo.save({
        id: newUuid(),
        rideId: saved.id,
        eventType: 'PAYMENT_METHOD_CHANGED',
        actorType: 'RIDER',
        actorId: input.riderId,
        previousStatus: saved.status,
        newStatus: saved.status,
        metadata: { method: 'CASH', previousMethod: 'UPI', onlineQrClosed: false },
        createdAt: now,
      });
    }
    return { ride: saved, replayed: false };
  }
}
