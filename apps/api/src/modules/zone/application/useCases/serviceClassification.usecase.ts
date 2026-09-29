import type {
  GeoPoint,
  RouteStateSegmentDto,
  ServiceClassificationDto,
  ServiceClassificationType,
  VehicleCategory,
} from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { isPointInPolygon } from '../../domain/index.js';
import type { ResolveZonesUseCase } from './resolveZones.usecase.js';

export interface ClassifyServiceInput {
  pickup: GeoPoint;
  drop: GeoPoint;
  routeStateSegments?: RouteStateSegmentDto[] | undefined;
  requestedService?: ServiceClassificationType | undefined;
  vehicleCategory?: VehicleCategory | undefined;
}

/** Rejects trips whose pickup or drop is outside the serviceable area (throws NOT_SERVICEABLE). */
export interface ServiceabilityGuard {
  execute(pickup: GeoPoint, drop: GeoPoint): Promise<unknown>;
}

export interface ServiceClassificationDeps {
  serviceabilityGuard?: ServiceabilityGuard | undefined;
  resolveZonesUseCase: ResolveZonesUseCase;
  globalDefaultBufferM?: number | undefined;
}

export class ServiceClassificationUseCase {
  constructor(private readonly deps: ServiceClassificationDeps) {}

  async execute(input: ClassifyServiceInput): Promise<ServiceClassificationDto> {
    await this.deps.serviceabilityGuard?.execute(input.pickup, input.drop);

    const segments = input.routeStateSegments ?? [];

    // 1. Check Interstate via route state segments
    const distinctStates = new Set(
      segments.map((s) => s.stateCode.trim().toUpperCase()).filter(Boolean),
    );

    // 2. Resolve geographic zones
    const resolved = await this.deps.resolveZonesUseCase.execute({
      pickup: input.pickup,
      drop: input.drop,
    });

    const originCity = resolved.city;

    let geoRecommendedType: ServiceClassificationType;
    let bufferApplied = false;

    if (distinctStates.size > 1) {
      geoRecommendedType = 'INTERSTATE';
    } else if (!originCity) {
      geoRecommendedType = 'OUTSTATION';
    } else {
      const dropInsideOriginCity = isPointInPolygon(input.drop, originCity.boundary);
      if (dropInsideOriginCity) {
        geoRecommendedType = 'IN_CITY';
        bufferApplied = false;
      } else if (resolved.destinationCity && resolved.destinationCity.id !== originCity.id) {
        // Drop is inside another operational city boundary -> OUTSTATION
        geoRecommendedType = 'OUTSTATION';
        bufferApplied = false;
      } else if (resolved.isWithinBuffer) {
        geoRecommendedType = 'IN_CITY';
        bufferApplied = true;
      } else {
        geoRecommendedType = 'OUTSTATION';
        bufferApplied = false;
      }
    }

    // 3. Enforce vehicle category constraints (E-Rickshaw = City only)
    if (input.vehicleCategory === 'E_RICKSHAW') {
      if (input.requestedService && input.requestedService !== 'IN_CITY') {
        throw AppError.badRequest(
          'E_RICKSHAW_CITY_ONLY: E-Rickshaw service is strictly restricted to in-city trips.',
        );
      }
      if (geoRecommendedType !== 'IN_CITY') {
        throw AppError.badRequest(
          'E_RICKSHAW_CITY_ONLY: E-Rickshaw cannot operate outside city boundary and buffer.',
        );
      }
    }

    // 4. Rider product selection authority (no silent auto-switch)
    const finalType = input.requestedService ?? geoRecommendedType;
    const hasDiscrepancy = Boolean(
      input.requestedService && input.requestedService !== geoRecommendedType,
    );

    return {
      type: finalType,
      cityZoneId: originCity?.id ?? null,
      cityName: originCity?.name ?? null,
      bufferApplied,
      stateSegments: segments,
      requestedService: input.requestedService ?? null,
      recommendedService: hasDiscrepancy ? geoRecommendedType : null,
      discrepancyNotice: hasDiscrepancy
        ? `Requested ${input.requestedService} but route geography indicates ${geoRecommendedType}.`
        : null,
    };
  }
}
