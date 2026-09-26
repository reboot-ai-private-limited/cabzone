import type {
  GeoPoint,
  RouteStateSegmentDto,
  ServiceClassificationDto,
  ServiceClassificationType,
  VehicleCategory,
} from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import {
  distanceToPolygonM,
  getEffectiveBufferDistance,
  isPointInPolygon,
  type ZoneEntity,
} from '../../domain/index.js';
import type { ResolveZonesUseCase } from './resolveZones.usecase.js';

export interface ClassifyServiceInput {
  pickup: GeoPoint;
  drop: GeoPoint;
  routeStateSegments?: RouteStateSegmentDto[] | undefined;
  requestedService?: ServiceClassificationType | undefined;
  vehicleCategory?: VehicleCategory | undefined;
}

export interface ServiceClassificationDeps {
  resolveZonesUseCase: ResolveZonesUseCase;
  globalDefaultBufferM?: number | undefined;
}

export class ServiceClassificationUseCase {
  constructor(private readonly deps: ServiceClassificationDeps) {}

  async execute(input: ClassifyServiceInput): Promise<ServiceClassificationDto> {
    const segments = input.routeStateSegments ?? [];

    // 1. Check Interstate via route state segments
    const distinctStates = new Set(
      segments.map((s) => s.stateCode.trim().toUpperCase()).filter(Boolean),
    );

    // 2. Resolve geographic zones (enforces EXCLUSION veto)
    const resolved = await this.deps.resolveZonesUseCase.execute({
      pickup: input.pickup,
      drop: input.drop,
      throwOnExclusion: true,
    });

    const activeCity = resolved.city ?? (resolved.isWithinBuffer ? resolved.nearestCity : null);

    let geoRecommendedType: ServiceClassificationType;
    let bufferApplied = false;

    if (distinctStates.size > 1) {
      geoRecommendedType = 'INTERSTATE';
    } else if (!activeCity) {
      geoRecommendedType = 'OUTSTATION';
    } else {
      const dropInsideCity = isPointInPolygon(input.drop, activeCity.boundary);
      if (dropInsideCity) {
        geoRecommendedType = 'IN_CITY';
        bufferApplied = resolved.isWithinBuffer;
      } else {
        const dropDistM = distanceToPolygonM(input.drop, activeCity.boundary);
        const effectiveBufferM = getEffectiveBufferDistance(
          activeCity as unknown as ZoneEntity,
          this.deps.globalDefaultBufferM ?? 20_000,
        );

        if (dropDistM <= effectiveBufferM) {
          geoRecommendedType = 'IN_CITY';
          bufferApplied = true;
        } else {
          geoRecommendedType = 'OUTSTATION';
        }
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
      cityZoneId: activeCity?.id ?? null,
      cityName: activeCity?.name ?? null,
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
