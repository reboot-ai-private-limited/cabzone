import {
  type TollSnapshot,
  type GeoPoint,
  type QuoteDto,
  type ServiceClassificationType,
  type StateDistanceBreakdown,
  type VehicleCategory,
  calculateNegotiationBounds,
  SERVICE_CLASSIFICATION_TYPES,
  VEHICLE_CATEGORIES,
} from '@cabzone/contracts';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import {
  getRiderUnpaidArrearsPaise,
  type WalletRepositoryPort,
} from '../../../ledger/ledger.public.js';
import {
  haversineDistanceM,
  type ServiceClassificationUseCase,
} from '../../../zone/zone.public.js';
import {
  calculateBaseFareEstimate,
  type PricingConfigRepositoryPort,
} from '../../domain/index.js';
import { isPointInIndia } from '@cabzone/geo';
import {
  calculateStateDistanceBreakdown,
  type RouteRequest,
  type RouteResult,
} from '../../../routing/routing.public.js';

export interface CreateQuoteInput {
  pickup: GeoPoint;
  drop: GeoPoint;
  vehicleCategory: VehicleCategory;
  requestedService?: ServiceClassificationType | undefined;
  riderId?: string | null | undefined;
}

export interface QuoteTokenPayload {
  tollSnapshot?: TollSnapshot | null | undefined;
  quoteId: string;
  pickup: GeoPoint;
  drop: GeoPoint;
  vehicleCategory: VehicleCategory;
  serviceType: ServiceClassificationType;
  cityZoneId: string | null;
  routeScope?: 'INTRA_STATE' | 'INTERSTATE' | null | undefined;
  originStateCode?: string | null | undefined;
  destinationStateCode?: string | null | undefined;
  originCountryCode?: string | null | undefined;
  destinationCountryCode?: string | null | undefined;
  originCityName?: string | null | undefined;
  destinationCityName?: string | null | undefined;
  stateBreakdown?: StateDistanceBreakdown[] | undefined;
  statePricingVersions?: { stateCode: string; configId: string; version: number }[] | undefined;
  routeProvider?: string | undefined;
  polyline?: string | null | undefined;
  pricingConfigId: string;
  pricingConfigVersion: number;
  distanceM: number;
  durationSeconds: number;
  suggestedFarePaise: number;
  floorPaise: number;
  ceilingPaise: number;
  expiresAtMs: number;
}

const pointSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});
const integerSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const tollSnapshotSchema = z.object({
  exists: z.boolean().nullable(),
  estimatedAmountPaise: integerSchema.nullable(),
  currency: z.literal('INR'),
  provider: z.string().min(1),
  isEstimate: z.literal(true),
  commercialVehicleCaveat: z.literal(true),
  permitsMayApply: z.boolean(),
});
const quotePayloadSchema = z
  .object({
    quoteId: z.string().uuid(),
    tollSnapshot: tollSnapshotSchema.nullish(),
    pickup: pointSchema,
    drop: pointSchema,
    vehicleCategory: z.enum(VEHICLE_CATEGORIES),
    serviceType: z.enum(SERVICE_CLASSIFICATION_TYPES),
    cityZoneId: z.string().nullable(),
    pricingConfigId: z.string().min(1),
    pricingConfigVersion: integerSchema.positive(),
    distanceM: integerSchema,
    durationSeconds: integerSchema,
    suggestedFarePaise: integerSchema,
    floorPaise: integerSchema,
    ceilingPaise: integerSchema,
    expiresAtMs: integerSchema.positive(),
    routeScope: z.enum(['INTRA_STATE', 'INTERSTATE']).nullish(),
    originStateCode: z.string().nullish(),
    destinationStateCode: z.string().nullish(),
    originCountryCode: z.string().nullish(),
    destinationCountryCode: z.string().nullish(),
    originCityName: z.string().nullish(),
    destinationCityName: z.string().nullish(),
    routeProvider: z.string().optional(),
    polyline: z.string().max(100000).nullish(),
    stateBreakdown: z
      .array(
        z.object({
          stateCode: z.string(),
          stateName: z.string(),
          distanceM: integerSchema,
          distanceKm: z.number().finite().nonnegative(),
          percentage: z.number().finite().min(0).max(100),
          ratePerKmPaise: integerSchema.optional(),
          distanceFarePaise: integerSchema.optional(),
        }),
      )
      .max(100)
      .optional(),
    statePricingVersions: z
      .array(
        z.object({
          stateCode: z.string(),
          configId: z.string().min(1),
          version: integerSchema.positive(),
        }),
      )
      .max(100)
      .optional(),
  })
  .refine(
    (quote) =>
      quote.floorPaise <= quote.ceilingPaise &&
      quote.floorPaise <= quote.suggestedFarePaise &&
      quote.suggestedFarePaise <= quote.ceilingPaise,
  );

export interface CreateQuoteDeps {
  serviceClassificationUseCase: ServiceClassificationUseCase;
  pricingConfigRepo: PricingConfigRepositoryPort;
  walletRepo?: WalletRepositoryPort | undefined;
  routingUseCase?: { execute(req: RouteRequest): Promise<RouteResult> } | undefined;
  tokenSecret: string;
  quoteTtlSeconds?: number | undefined; // default 300 (5 minutes)
}

export class CreateQuoteUseCase {
  private readonly ttlSeconds: number;

  constructor(private readonly deps: CreateQuoteDeps) {
    this.ttlSeconds = deps.quoteTtlSeconds ?? 300; // 5 minutes per PRD v2
  }

  async execute(input: CreateQuoteInput): Promise<QuoteDto> {
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

    // 1. Classify the trip and resolve origin/destination state (display-only). Every
    // destination state is serviceable — the only gate left is "pickup in an active zone".
    const classification = await this.deps.serviceClassificationUseCase.execute({
      pickup: input.pickup,
      drop: input.drop,
      vehicleCategory: input.vehicleCategory,
      requestedService: input.requestedService,
    });

    // 2. Compute route via routing provider
    let routeResult: RouteResult;
    if (this.deps.routingUseCase) {
      routeResult = await this.deps.routingUseCase.execute({
        origin: input.pickup,
        destination: input.drop,
        vehicleCategory: input.vehicleCategory,
      });
    } else {
      const distanceM = haversineDistanceM(input.pickup, input.drop);
      routeResult = {
        provider: 'HAVERSINE_ESTIMATE',
        distanceM,
        durationS: Math.max(60, Math.round(distanceM / 8.33)),
        polyline: null,
      };
    }

    // 3. Load effective pricing config via 3-tier hierarchy:
    // Tier 1: City Zone (if inside operational city or nearest city)
    // Tier 2: State Pricing (pickup state, manual add like WB, SK)
    // Tier 3: Global Pricing (default fallback)
    const config = await this.deps.pricingConfigRepo.findEffectiveConfig(
      {
        cityZoneId: classification.cityZoneId,
        stateCode: classification.originStateCode,
      },
      input.vehicleCategory,
    );

    if (!config) {
      if (!classification.cityZoneId) {
        throw AppError.badRequest(
          'NO_ACTIVE_ZONE: Service is not available for this route or location.',
        );
      }
      throw AppError.notFound(
        `PRICING_UNAVAILABLE: No active pricing configuration found for ${input.vehicleCategory} in this location or zone.`,
      );
    }

    // 4. Compute state distance breakdown for outstation routes
    const stateBreakdown = calculateStateDistanceBreakdown({
      origin: input.pickup,
      destination: input.drop,
      totalDistanceM: routeResult.distanceM,
      polyline: routeResult.polyline,
    });

    // 5. If route crosses multiple states in an outstation trip, resolve per-state rates
    const stateRateCache = new Map<string, number>();
    const statePricingVersions: { stateCode: string; configId: string; version: number }[] = [];
    const crossesStateBoundary =
      classification.routeScope === 'INTERSTATE' || stateBreakdown.length > 1;
    if (classification.serviceType === 'OUTSTATION' && crossesStateBoundary) {
      for (const seg of stateBreakdown) {
        const stateCfg = await this.deps.pricingConfigRepo.findEffectiveConfigByState(
          seg.stateCode,
          input.vehicleCategory,
        );
        if (stateCfg) {
          stateRateCache.set(seg.stateCode, stateCfg.outstationRatePerKmPaise);
          statePricingVersions.push({
            stateCode: seg.stateCode,
            configId: stateCfg.id,
            version: stateCfg.version,
          });
        }
      }
    }

    // 6. Calculate fare
    const suggestedFarePaise = calculateBaseFareEstimate({
      config,
      distanceM: routeResult.distanceM,
      serviceType: classification.serviceType,
      isBufferFallback: classification.bufferApplied,
      stateBreakdown,
      stateRateResolver: (sc) => stateRateCache.get(sc) ?? null,
    });

    const effectiveMinimumFarePaise =
      classification.serviceType === 'OUTSTATION'
        ? config.outstationMinimumFarePaise
        : config.minimumFarePaise;

    const bounds = calculateNegotiationBounds({
      suggestedFarePaise,
      minimumFarePaise: effectiveMinimumFarePaise,
      floorPercent: config.negotiationFloorPercent,
      ceilingPercent: config.negotiationCeilingPercent,
    });

    const riderWallet =
      input.riderId && this.deps.walletRepo
        ? await this.deps.walletRepo.findByRiderId(input.riderId)
        : null;
    const arrearsPaise = getRiderUnpaidArrearsPaise(riderWallet);
    const totalEstimatedPayablePaise = suggestedFarePaise + arrearsPaise;
    const cashAllowed = true;

    const quoteId = newUuid();
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
    const expiresAtMs = expiresAt.getTime();

    const payload: QuoteTokenPayload = {
      tollSnapshot: {
        ...(routeResult.tollInfo ?? { exists: null, estimatedAmountPaise: null, currency: 'INR' }),
        provider: routeResult.provider,
        isEstimate: true,
        commercialVehicleCaveat: true,
        permitsMayApply: crossesStateBoundary,
      },
      quoteId,
      pickup: { lat: input.pickup.lat, lng: input.pickup.lng },
      drop: { lat: input.drop.lat, lng: input.drop.lng },
      vehicleCategory: input.vehicleCategory,
      serviceType: classification.type,
      cityZoneId: classification.cityZoneId,
      routeScope: classification.routeScope ?? null,
      originStateCode: classification.originStateCode ?? null,
      destinationStateCode: classification.destinationStateCode ?? null,
      originCountryCode: classification.originCountryCode ?? null,
      destinationCountryCode: classification.destinationCountryCode ?? null,
      originCityName: classification.originCityName ?? null,
      destinationCityName: classification.destinationCityName ?? null,
      stateBreakdown,
      routeProvider: routeResult.provider,
      statePricingVersions,
      polyline: routeResult.polyline,
      pricingConfigId: config.id,
      pricingConfigVersion: config.version,
      distanceM: routeResult.distanceM,
      durationSeconds: routeResult.durationS,
      suggestedFarePaise,
      floorPaise: bounds.floorPaise,
      ceilingPaise: bounds.ceilingPaise,
      expiresAtMs,
    };

    const quoteToken = CreateQuoteUseCase.signQuotePayload(payload, this.deps.tokenSecret);

    return {
      quoteId,
      tollSnapshot: payload.tollSnapshot ?? null,
      pickup: input.pickup,
      drop: input.drop,
      distanceM: routeResult.distanceM,
      estimatedDurationSeconds: routeResult.durationS,
      serviceType: classification.type,
      cityZoneId: classification.cityZoneId,
      cityName: classification.cityName,
      bufferApplied: classification.bufferApplied,
      vehicleCategory: input.vehicleCategory,
      suggestedFarePaise,
      arrearsPaise,
      totalEstimatedPayablePaise,
      cashAllowed,
      pricingConfigId: config.id,
      pricingConfigVersion: config.version,
      routeScope: classification.routeScope ?? null,
      originStateCode: classification.originStateCode ?? null,
      destinationStateCode: classification.destinationStateCode ?? null,
      originCountryCode: classification.originCountryCode ?? null,
      destinationCountryCode: classification.destinationCountryCode ?? null,
      originCityName: classification.originCityName ?? null,
      destinationCityName: classification.destinationCityName ?? null,
      stateBreakdown,
      routeProvider: routeResult.provider,
      negotiation: {
        floorPaise: bounds.floorPaise,
        ceilingPaise: bounds.ceilingPaise,
      },
      expiresAt: expiresAt.toISOString(),
      quoteToken,
    };
  }

  static signQuotePayload(payload: QuoteTokenPayload, secret: string): string {
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', secret).update(data).digest('base64url');
    return `${data}.${signature}`;
  }

  static verifyQuoteToken(
    token: string,
    secret: string,
    now: Date = new Date(),
  ): QuoteTokenPayload {
    const parts = token.split('.');
    if (token.length > 200000)
      throw AppError.badRequest('INVALID_QUOTE_TOKEN: Quote token is too large.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw AppError.badRequest('INVALID_QUOTE_TOKEN: Malformed quote token.');
    }

    const [data, signature] = parts;
    const expectedSig = createHmac('sha256', secret).update(data).digest('base64url');
    if (
      signature.length !== expectedSig.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
    ) {
      throw AppError.badRequest('INVALID_QUOTE_TOKEN: Quote signature verification failed.');
    }

    let payload: QuoteTokenPayload;
    try {
      payload = quotePayloadSchema.parse(
        JSON.parse(Buffer.from(data, 'base64url').toString('utf8')),
      );
    } catch {
      throw AppError.badRequest('INVALID_QUOTE_TOKEN: Corrupted quote payload.');
    }

    if (now.getTime() >= payload.expiresAtMs) {
      throw AppError.badRequest(
        'QUOTE_EXPIRED: Quote has expired. Quotes are valid for 5 minutes. Please fetch a fresh quote.',
      );
    }

    return payload;
  }
}
