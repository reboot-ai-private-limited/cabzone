import { createHmac } from 'node:crypto';
import type {
  GeoPoint,
  QuoteDto,
  ServiceClassificationType,
  VehicleCategory,
} from '@cabzone/contracts';
import { calculateNegotiationBounds } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import {
  haversineDistanceM,
  type ServiceClassificationUseCase,
} from '../../../zone/index.js';
import {
  calculateBaseFareEstimate,
  type PricingConfigRepositoryPort,
} from '../../domain/index.js';

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
  tokenSecret: string;
  quoteTtlSeconds?: number | undefined; // default 300 (5 minutes)
}

export class CreateQuoteUseCase {
  private readonly ttlSeconds: number;

  constructor(private readonly deps: CreateQuoteDeps) {
    this.ttlSeconds = deps.quoteTtlSeconds ?? 300; // 5 minutes per PRD v2
  }

  async execute(input: CreateQuoteInput): Promise<QuoteDto> {
    const classification = await this.deps.serviceClassificationUseCase.execute({
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

    const config = await this.deps.pricingConfigRepo.findEffectiveConfig(
      classification.cityZoneId,
      input.vehicleCategory,
    );

    if (!config) {
      throw AppError.notFound(
        `PRICING_UNAVAILABLE: No active pricing configuration found for ${input.vehicleCategory} in this zone.`,
      );
    }

    const distanceM = haversineDistanceM(input.pickup, input.drop);
    const estimatedDurationSeconds = Math.max(60, Math.round(distanceM / 8.33)); // ~30 km/h

    const suggestedFarePaise = calculateBaseFareEstimate({
      config,
      distanceM,
      isBufferFallback: classification.bufferApplied,
    });

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
      pricingConfigId: config.id,
      pricingConfigVersion: config.version,
      distanceM,
      durationSeconds: estimatedDurationSeconds,
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
      distanceM,
      estimatedDurationSeconds,
      serviceType: classification.type,
      cityZoneId: classification.cityZoneId,
      cityName: classification.cityName,
      bufferApplied: classification.bufferApplied,
      vehicleCategory: input.vehicleCategory,
      suggestedFarePaise,
      pricingConfigId: config.id,
      pricingConfigVersion: config.version,
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
