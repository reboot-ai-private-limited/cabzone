import type { GeoPoint, ResolvedZones } from '@cabzone/contracts';
import { isPointInIndia } from '@cabzone/geo';
import { AppError } from '../../../../shared/errors/AppError.js';
import type {
  CoverageRequestRepositoryPort,
  ZoneEntity,
  ZoneRepositoryPort,
} from '../../domain/index.js';
import { distanceToPolygonM, getEffectiveBufferDistance, isPointInPolygon, zoneEntityToDto } from '../../domain/index.js';

export interface ResolveZonesInput {
  pickup: GeoPoint;
  drop: GeoPoint;
  riderId?: string | undefined;
}

export interface ResolveZonesDeps {
  zoneRepo: ZoneRepositoryPort;
  coverageRepo?: CoverageRequestRepositoryPort | undefined;
  globalDefaultBufferM?: number | undefined;
}

export class ResolveZonesUseCase {
  constructor(private readonly deps: ResolveZonesDeps) {}

  async execute(input: ResolveZonesInput): Promise<ResolvedZones> {
    this.validateCoordinates(input.pickup, 'Pickup');
    this.validateCoordinates(input.drop, 'Drop');

    // 1. Resolve origin CITY containing pickup
    const originCities = await this.deps.zoneRepo.findActiveCitiesContainingPoint(input.pickup);
    const originCityEntity = originCities[0] ?? null;

    let nearestCityEntity: ZoneEntity | null = null;
    if (!originCityEntity) {
      nearestCityEntity = await this.deps.zoneRepo.findNearestActiveCity(input.pickup);
    }

    // 2. Resolve destination CITY containing drop
    const dropCities = await this.deps.zoneRepo.findActiveCitiesContainingPoint(input.drop);
    const dropCityEntity = dropCities[0] ?? null;

    // 3. Evaluate destination buffer relative to origin city boundary
    let isWithinBuffer = false;
    let distanceToCityBoundaryM: number | null = null;

    if (originCityEntity) {
      const dropInsideOriginCity = isPointInPolygon(input.drop, originCityEntity.boundary);
      if (dropInsideOriginCity) {
        isWithinBuffer = false;
        distanceToCityBoundaryM = 0;
      } else if (dropCityEntity) {
        // Drop is inside another operational city boundary -> OUTSTATION, buffer never swallows another city
        isWithinBuffer = false;
        distanceToCityBoundaryM = 0;
      } else {
        // Drop is outside all operational cities -> check distance to origin city boundary
        const distM = distanceToPolygonM(input.drop, originCityEntity.boundary);
        distanceToCityBoundaryM = distM;
        const effectiveBufferM = getEffectiveBufferDistance(
          originCityEntity,
          this.deps.globalDefaultBufferM ?? 20_000,
        );
        isWithinBuffer = distM <= effectiveBufferM;
      }
    } else if (nearestCityEntity) {
      // Pickup is outside all operational cities -> check distance to nearest city boundary
      if (dropCityEntity && dropCityEntity.id !== nearestCityEntity.id) {
        // Drop is inside another operational city boundary -> OUTSTATION
        isWithinBuffer = false;
        distanceToCityBoundaryM = null;
      } else {
        const pickupDistM = distanceToPolygonM(input.pickup, nearestCityEntity.boundary);
        const dropInsideNearestCity = isPointInPolygon(input.drop, nearestCityEntity.boundary);
        const dropDistM = dropInsideNearestCity
          ? 0
          : distanceToPolygonM(input.drop, nearestCityEntity.boundary);

        const effectiveBufferM = getEffectiveBufferDistance(
          nearestCityEntity,
          this.deps.globalDefaultBufferM ?? 20_000,
        );

        isWithinBuffer = pickupDistM <= effectiveBufferM && dropDistM <= effectiveBufferM;
        distanceToCityBoundaryM = Math.max(pickupDistM, dropDistM);
      }
    }

    return {
      city: originCityEntity ? zoneEntityToDto(originCityEntity) : null,
      destinationCity: dropCityEntity ? zoneEntityToDto(dropCityEntity) : null,
      isWithinBuffer,
      distanceToCityBoundaryM,
      nearestCity: nearestCityEntity ? zoneEntityToDto(nearestCityEntity) : null,
      pickupCoverage: null,
      dropHill: null,
      pickupChargePaise: 0,
    };
  }

  private validateCoordinates(point: GeoPoint, label: string): void {
    if (
      typeof point.lat !== 'number' ||
      typeof point.lng !== 'number' ||
      Number.isNaN(point.lat) ||
      Number.isNaN(point.lng) ||
      point.lat < -90 ||
      point.lat > 90 ||
      point.lng < -180 ||
      point.lng > 180
    ) {
      throw AppError.badRequest(`${label} location has invalid geographic coordinates.`);
    }

    const indiaCheck = isPointInIndia(point);
    if (!indiaCheck.inside) {
      throw AppError.badRequest(
        `OUTSIDE_INDIA: ${label} location must be within India. ${indiaCheck.reason ?? 'Cabzone services operate strictly within Indian territory.'}`,
      );
    }
  }
}


