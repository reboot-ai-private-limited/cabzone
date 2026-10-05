import type {
  GeoPoint,
  ResolvedLocationDetails,
  ServiceClassificationDto,
  ServiceClassificationType,
  VehicleCategory,
} from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { isPointInPolygon } from '../../domain/index.js';
import { isPointInIndia } from '@cabzone/geo';
import type { ResolveZonesUseCase } from './resolveZones.usecase.js';

export interface ClassifyServiceInput {
  pickup: GeoPoint;
  drop: GeoPoint;
  requestedService?: ServiceClassificationType | undefined;
  vehicleCategory?: VehicleCategory | undefined;
}

/** Resolves geographic and state details for points. Display and classification only. */
export interface DestinationStateResolver {
  execute(point: GeoPoint): Promise<string | null>;
  resolveLocation?(point: GeoPoint): Promise<ResolvedLocationDetails>;
}

export interface ServiceClassificationDeps {
  destinationStateResolver?: DestinationStateResolver | undefined;
  resolveZonesUseCase: ResolveZonesUseCase;
  globalDefaultBufferM?: number | undefined;
}

export class ServiceClassificationUseCase {
  constructor(private readonly deps: ServiceClassificationDeps) {}

  async execute(input: ClassifyServiceInput): Promise<ServiceClassificationDto> {
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

    // 1. Resolve geographic zones
    const resolved = await this.deps.resolveZonesUseCase.execute({
      pickup: input.pickup,
      drop: input.drop,
    });

    const originCity = resolved.city;
    const pricingCity = resolved.city ?? resolved.nearestCity;

    // 2. CITY vs OUTSTATION, before any state resolution.
    let isCity: boolean;
    let bufferApplied = false;

    if (!originCity) {
      if (resolved.isWithinBuffer && pricingCity) {
        // Pickup is outside city polygon, but within nearest city's buffer distance,
        // and drop is inside or within buffer of the same city -> IN_CITY with buffer surcharge
        isCity = true;
        bufferApplied = true;
      } else {
        isCity = false;
      }
    } else {
      const dropInsideOriginCity = isPointInPolygon(input.drop, originCity.boundary);
      if (dropInsideOriginCity) {
        isCity = true;
      } else if (resolved.destinationCity && resolved.destinationCity.id !== originCity.id) {
        // Drop is inside another operational city boundary -> OUTSTATION
        isCity = false;
      } else if (resolved.isWithinBuffer) {
        isCity = true;
        bufferApplied = true;
      } else {
        isCity = false;
      }
    }

    // 3. Resolve origin/destination state & country codes for outstation trips — display-only, never
    // gates serviceability or pricing.
    let originStateCode: string | null = null;
    let destinationStateCode: string | null = null;
    let originCountryCode: string | null = null;
    let destinationCountryCode: string | null = null;
    let originCityName: string | null = pricingCity?.name ?? null;
    let destinationCityName: string | null = resolved.destinationCity?.name ?? null;

    if (!isCity) {
      if (this.deps.destinationStateResolver?.resolveLocation) {
        const originLoc = await this.deps.destinationStateResolver.resolveLocation(input.pickup);
        originStateCode = originLoc.stateCode ?? pricingCity?.stateCode ?? null;
        originCountryCode = originLoc.countryCode ?? 'IN';
        if (originLoc.city) originCityName = originLoc.city;
      } else {
        originStateCode = pricingCity?.stateCode ?? null;
        originCountryCode = 'IN';
      }

      if (resolved.destinationCity) {
        destinationStateCode = resolved.destinationCity.stateCode;
        destinationCountryCode = 'IN';
        destinationCityName = resolved.destinationCity.name;
      } else if (this.deps.destinationStateResolver?.resolveLocation) {
        const dropLoc = await this.deps.destinationStateResolver.resolveLocation(input.drop);
        destinationStateCode = dropLoc.stateCode;
        destinationCountryCode = dropLoc.countryCode ?? 'IN';
        if (dropLoc.city) destinationCityName = dropLoc.city;
      } else {
        destinationStateCode =
          (await this.deps.destinationStateResolver?.execute(input.drop)) ?? null;
        destinationCountryCode = 'IN';
      }
    } else {
      originStateCode = pricingCity?.stateCode ?? null;
      destinationStateCode = null;
      originCountryCode = 'IN';
      destinationCountryCode = 'IN';
    }

    if (originCountryCode && originCountryCode !== 'IN') {
      throw AppError.badRequest(
        'OUTSIDE_INDIA: Pickup location must be within India. Cabzone operates strictly within Indian sovereign territory.',
      );
    }
    if (destinationCountryCode && destinationCountryCode !== 'IN') {
      throw AppError.badRequest(
        'OUTSIDE_INDIA: Drop location must be within India. Cross-border trips are strictly prohibited.',
      );
    }

    const crossesStates = Boolean(
      originStateCode && destinationStateCode && originStateCode !== destinationStateCode,
    );

    const geoRecommendedType: ServiceClassificationType = isCity
      ? 'IN_CITY'
      : crossesStates
        ? 'INTERSTATE'
        : 'OUTSTATION';

    // 4. Enforce vehicle category constraints (E-Rickshaw = City only)
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

    // 5. Rider product selection authority (no silent auto-switch)
    const finalType = input.requestedService ?? geoRecommendedType;
    const hasDiscrepancy = Boolean(
      input.requestedService && input.requestedService !== geoRecommendedType,
    );

    const serviceType = finalType === 'IN_CITY' ? 'CITY' : 'OUTSTATION';
    const routeScope =
      serviceType === 'CITY' || !originStateCode || !destinationStateCode
        ? null
        : originStateCode === destinationStateCode
          ? 'INTRA_STATE'
          : 'INTERSTATE';

    return {
      serviceType,
      routeScope,
      originStateCode,
      destinationStateCode,
      originCountryCode,
      destinationCountryCode,
      originCityName,
      destinationCityName,
      type: finalType,
      cityZoneId: pricingCity?.id ?? null,
      cityName: pricingCity?.name ?? null,
      bufferApplied,
      requestedService: input.requestedService ?? null,
      recommendedService: hasDiscrepancy ? geoRecommendedType : null,
      discrepancyNotice: hasDiscrepancy
        ? `Requested ${input.requestedService} but route geography indicates ${geoRecommendedType}.`
        : null,
    };
  }
}
