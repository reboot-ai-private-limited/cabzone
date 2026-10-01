import { createHmac } from 'node:crypto';
import type {
  GeoPoint,
  QuoteDto,
  RouteStateSegmentDto,
  ServiceClassificationType,
  VehicleCategory,
} from '@cabzone/contracts';
import { calculateNegotiationBounds } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import {
  haversineDistanceM,
  type ServiceClassificationUseCase,
} from '../../../zone/zone.public.js';
import {
  calculateFare,
  type AppliedSegment,
  type PricingConfigRepositoryPort,
  type StatePricingEntity,
  type StatePricingRepositoryPort,
} from '../../domain/index.js';
import type { RouteRequest, RouteResult } from '../../../routing/routing.public.js';

export interface CreateQuoteInput {
  pickup: GeoPoint;
  drop: GeoPoint;
  vehicleCategory: VehicleCategory;
  requestedService?: ServiceClassificationType | undefined;
}

export interface QuoteTokenPayload {
  quoteId: string;
  pickup: GeoPoint;
  drop: GeoPoint;
  vehicleCategory: VehicleCategory;
  serviceType: ServiceClassificationType;
  cityZoneId: string | null;
  routeScope?: 'INTRA_STATE' | 'INTERSTATE' | null | undefined;
  destinationStateCode?: string | null | undefined;
  stateBoundaryVersion?: number | null | undefined;
  stateConfigVersion?: number | null | undefined;
  routeProvider?: string | undefined;
  stateSegments?: AppliedSegment[] | undefined;
  statePricingVersions?: Record<string, number> | undefined;
  pricingConfigId: string;
  pricingConfigVersion: number;
  distanceM: number;
  durationSeconds: number;
  suggestedFarePaise: number;
  floorPaise: number;
  ceilingPaise: number;
  expiresAtMs: number;
}

export interface CreateQuoteDeps {
  serviceClassificationUseCase: ServiceClassificationUseCase;
  pricingConfigRepo: PricingConfigRepositoryPort;
  statePricingRepo?: StatePricingRepositoryPort | undefined;
  routingUseCase?: { execute(req: RouteRequest): Promise<RouteResult> } | undefined;
  resolveRouteStatesUseCase?: {
    execute(polyline: string | null | undefined): Promise<RouteStateSegmentDto[]>;
  } | undefined;
  tokenSecret: string;
  quoteTtlSeconds?: number | undefined; // default 300 (5 minutes)
}

function capSegments(segments: AppliedSegment[], max = 8): AppliedSegment[] {
  if (segments.length <= max) return segments;
  const head = segments.slice(0, max - 1);
  const tail = segments.slice(max - 1);
  const tailDistanceM = tail.reduce((sum, s) => sum + s.distanceM, 0);
  const last = {
    stateCode: tail[tail.length - 1]!.stateCode,
    distanceM: tailDistanceM,
    ratePerKmPaise: tail[tail.length - 1]!.ratePerKmPaise,
  };
  return [...head, last];
}

export class CreateQuoteUseCase {
  private readonly ttlSeconds: number;

  constructor(private readonly deps: CreateQuoteDeps) {
    this.ttlSeconds = deps.quoteTtlSeconds ?? 300; // 5 minutes per PRD v2
  }

  async execute(input: CreateQuoteInput): Promise<QuoteDto> {
    // 1. Initial serviceability classification without route segments.
    // Guard against unserviceable origin/destination states before calling external routing.
    let classification = await this.deps.serviceClassificationUseCase.execute({
      pickup: input.pickup,
      drop: input.drop,
      vehicleCategory: input.vehicleCategory,
      requestedService: input.requestedService,
    });

    if (!classification.cityZoneId) {
      throw AppError.badRequest(
        'NO_ACTIVE_ZONE: Service is not available for this route or location.',
      );
    }

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

    // 3. Resolve traversed states along the polyline path
    let routeSegments: RouteStateSegmentDto[] = [];
    if (this.deps.resolveRouteStatesUseCase && routeResult.polyline) {
      routeSegments = await this.deps.resolveRouteStatesUseCase.execute(routeResult.polyline);
    } else if (classification.destinationStateCode) {
      routeSegments = [
        {
          stateCode: classification.destinationStateCode,
          distanceM: routeResult.distanceM,
        },
      ];
    }

    // 4. If segments cover more than one state but classification is not INTERSTATE,
    // re-run classification with routeStateSegments
    const distinctStates = new Set(
      routeSegments.map((s) => s.stateCode).filter((c) => c !== 'UNKNOWN'),
    );
    if (distinctStates.size > 1 && classification.routeScope !== 'INTERSTATE') {
      classification = await this.deps.serviceClassificationUseCase.execute({
        pickup: input.pickup,
        drop: input.drop,
        vehicleCategory: input.vehicleCategory,
        requestedService: input.requestedService,
        routeStateSegments: routeSegments,
      });
    }

    // 5. Load city pricing config
    if (!classification.cityZoneId) {
      throw AppError.badRequest(
        'NO_ACTIVE_ZONE: Service is not available for this route or location.',
      );
    }

    const config = await this.deps.pricingConfigRepo.findEffectiveConfig(
      classification.cityZoneId,
      input.vehicleCategory,
    );

    if (!config) {
      throw AppError.notFound(
        `PRICING_UNAVAILABLE: No active pricing configuration found for ${input.vehicleCategory} in this zone.`,
      );
    }

    // 6. Load state rates for every traversed state
    const stateRates: Record<string, StatePricingEntity | null> = {};
    const statePricingVersions: Record<string, number> = {};

    if (this.deps.statePricingRepo) {
      const stateCodesToFetch = new Set<string>();
      if (classification.destinationStateCode) {
        stateCodesToFetch.add(classification.destinationStateCode);
      }
      for (const seg of routeSegments) {
        if (seg.stateCode && seg.stateCode !== 'UNKNOWN') {
          stateCodesToFetch.add(seg.stateCode);
        }
      }

      for (const code of stateCodesToFetch) {
        const sp = await this.deps.statePricingRepo.findByStateCode(code);
        stateRates[code] = sp;
        if (sp) {
          statePricingVersions[code] = sp.version;
        }
      }
    }

    // 7. Calculate fare using pure calculateFare function (Assumptions A-D)
    const fareCalculation = calculateFare({
      config,
      distanceM: routeResult.distanceM,
      routeScope: classification.routeScope,
      segments: routeSegments,
      destinationStateCode: classification.destinationStateCode,
      stateRates,
      isBufferFallback: classification.bufferApplied,
    });

    const suggestedFarePaise = fareCalculation.farePaise;
    const cappedAppliedSegments = capSegments(fareCalculation.appliedSegments);

    const bounds = calculateNegotiationBounds({
      suggestedFarePaise,
      minimumFarePaise: config.minimumFarePaise,
      floorPercent: config.negotiationFloorPercent,
      ceilingPercent: config.negotiationCeilingPercent,
    });

    const quoteId = newUuid();
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
    const expiresAtMs = expiresAt.getTime();

    const payload: QuoteTokenPayload = {
      quoteId,
      pickup: { lat: input.pickup.lat, lng: input.pickup.lng },
      drop: { lat: input.drop.lat, lng: input.drop.lng },
      vehicleCategory: input.vehicleCategory,
      serviceType: classification.type,
      cityZoneId: classification.cityZoneId,
      routeScope: classification.routeScope ?? null,
      destinationStateCode: classification.destinationStateCode ?? null,
      stateBoundaryVersion: classification.stateBoundaryVersion ?? null,
      stateConfigVersion: classification.stateConfigVersion ?? null,
      routeProvider: routeResult.provider,
      stateSegments: cappedAppliedSegments,
      statePricingVersions:
        Object.keys(statePricingVersions).length > 0 ? statePricingVersions : undefined,
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
      pricingConfigId: config.id,
      pricingConfigVersion: config.version,
      routeScope: classification.routeScope ?? null,
      destinationStateCode: classification.destinationStateCode ?? null,
      stateBoundaryVersion: classification.stateBoundaryVersion ?? null,
      stateConfigVersion: classification.stateConfigVersion ?? null,
      routeProvider: routeResult.provider,
      stateSegments: cappedAppliedSegments,
      statePricingVersions:
        Object.keys(statePricingVersions).length > 0 ? statePricingVersions : undefined,
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
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw AppError.badRequest('INVALID_QUOTE_TOKEN: Malformed quote token.');
    }

    const [data, signature] = parts;
    const expectedSig = createHmac('sha256', secret).update(data).digest('base64url');
    if (signature !== expectedSig) {
      throw AppError.badRequest('INVALID_QUOTE_TOKEN: Quote signature verification failed.');
    }

    let payload: QuoteTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as QuoteTokenPayload;
    } catch {
      throw AppError.badRequest('INVALID_QUOTE_TOKEN: Corrupted quote payload.');
    }

    if (now.getTime() > payload.expiresAtMs) {
      throw AppError.badRequest(
        'QUOTE_EXPIRED: Quote has expired. Quotes are valid for 5 minutes. Please fetch a fresh quote.',
      );
    }

    return payload;
  }
}
