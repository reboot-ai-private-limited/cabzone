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

/** A state as resolved from a point; structurally what the state boundary module returns. */
export interface GuardedState {
  stateCode: string;
  boundaryVersion: number;
  configVersion: number;
  intrastateEnabled: boolean;
  interstateDropOffEnabled: boolean;
}

/** Rejects trips whose pickup or drop is outside the serviceable area (throws NOT_SERVICEABLE). */
export interface ServiceabilityGuard {
  execute(pickup: GeoPoint, drop: GeoPoint): Promise<{ pickup: GuardedState; drop: GuardedState }>;
}

export interface ServiceClassificationDeps {
  serviceabilityGuard?: ServiceabilityGuard | undefined;
  resolveZonesUseCase: ResolveZonesUseCase;
  globalDefaultBufferM?: number | undefined;
}

export class ServiceClassificationUseCase {
  constructor(private readonly deps: ServiceClassificationDeps) {}

  async execute(input: ClassifyServiceInput): Promise<ServiceClassificationDto> {
    const states = await this.deps.serviceabilityGuard?.execute(input.pickup, input.drop);

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

    // The route's states are authoritative when known; otherwise fall back to the endpoints' states.
    const crossesStates =
      distinctStates.size > 1 ||
      (states !== undefined && states.pickup.stateCode !== states.drop.stateCode);

    if (crossesStates) {
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

    // 5. Route scope and state serviceability. City trips need no state configuration.
    const serviceType = finalType === 'IN_CITY' ? 'CITY' : 'OUTSTATION';
    const routeScope = serviceType === 'CITY' ? null : crossesStates ? 'INTERSTATE' : 'INTRA_STATE';
    if (states !== undefined && routeScope === 'INTRA_STATE' && !states.drop.intrastateEnabled) {
      throw AppError.badRequest(
        'INTRASTATE_SERVICE_DISABLED: Outstation trips within this state are not available right now.',
      );
    }
    if (states !== undefined && routeScope === 'INTERSTATE' && !states.drop.interstateDropOffEnabled) {
      throw AppError.badRequest(
        'INTERSTATE_SERVICE_DISABLED: Drop-offs in the destination state are not available right now.',
      );
    }

    return {
      serviceType,
      routeScope,
      originStateCode: states?.pickup.stateCode ?? null,
      destinationStateCode: states?.drop.stateCode ?? null,
      stateBoundaryVersion: states?.drop.boundaryVersion ?? null,
      stateConfigVersion: states?.drop.configVersion ?? null,
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
