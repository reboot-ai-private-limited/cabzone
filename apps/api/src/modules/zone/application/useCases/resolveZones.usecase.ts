import type { GeoPoint, ResolvedZones, ZoneDto } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import type { ZoneEntity, ZoneRepositoryPort } from '../../domain/index.js';
import { distanceToPolygonM, getEffectiveBufferDistance } from '../../domain/index.js';

export interface ResolveZonesInput {
  pickup: GeoPoint;
  drop: GeoPoint;
  throwOnExclusion?: boolean | undefined;
}

export interface ResolveZonesDeps {
  zoneRepo: ZoneRepositoryPort;
  globalDefaultBufferM?: number | undefined;
}

export class ResolveZonesUseCase {
  constructor(private readonly deps: ResolveZonesDeps) {}

  async execute(input: ResolveZonesInput): Promise<ResolvedZones> {
    this.validateCoordinates(input.pickup, 'Pickup');
    this.validateCoordinates(input.drop, 'Drop');

    const shouldThrow = input.throwOnExclusion !== false;

    // 1. Check EXCLUSION zones (absolute veto)
    const [pickupExclusions, dropExclusions] = await Promise.all([
      this.deps.zoneRepo.findActiveExclusionsContainingPoint(input.pickup),
      this.deps.zoneRepo.findActiveExclusionsContainingPoint(input.drop),
    ]);

    const pickupExclusion = pickupExclusions[0] ? this.toDto(pickupExclusions[0]) : null;
    const dropExclusion = dropExclusions[0] ? this.toDto(dropExclusions[0]) : null;

    if (pickupExclusion && shouldThrow) {
      throw AppError.badRequest(
        'PICKUP_IN_EXCLUSION_ZONE: Pickup location is inside a restricted exclusion zone.',
      );
    }

    if (dropExclusion && shouldThrow) {
      throw AppError.badRequest(
        'DROP_IN_EXCLUSION_ZONE: Drop location is inside a restricted exclusion zone.',
      );
    }

    // 2. Resolve CITY containing pickup
    const cities = await this.deps.zoneRepo.findActiveCitiesContainingPoint(input.pickup);
    const cityEntity = cities[0] ?? null;

    // 3. Resolve PICKUP zone containing pickup
    const pickups = await this.deps.zoneRepo.findActivePickupsContainingPoint(input.pickup);
    const pickupZoneEntity = pickups[0] ?? null;

    // 4. Resolve derived buffer coverage when outside any CITY polygon
    let isWithinBuffer = false;
    let nearestCityEntity: ZoneEntity | null = null;

    if (!cityEntity) {
      nearestCityEntity = await this.deps.zoneRepo.findNearestActiveCity(input.pickup);
      if (nearestCityEntity) {
        const distM = distanceToPolygonM(input.pickup, nearestCityEntity.boundary);
        const effectiveBufferM = getEffectiveBufferDistance(
          nearestCityEntity,
          this.deps.globalDefaultBufferM ?? 20_000,
        );
        isWithinBuffer = distM <= effectiveBufferM;
      }
    }

    return {
      pickupExclusion,
      dropExclusion,
      city: cityEntity ? this.toDto(cityEntity) : null,
      pickupCoverage: pickupZoneEntity ? this.toDto(pickupZoneEntity) : null,
      isWithinBuffer,
      nearestCity: nearestCityEntity ? this.toDto(nearestCityEntity) : null,
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
  }

  private toDto(zone: ZoneEntity): ZoneDto {
    return {
      id: zone.id,
      name: zone.name,
      zoneType: zone.zoneType,
      parentCityZoneId: zone.parentCityZoneId,
      stateCode: zone.stateCode,
      boundary: zone.boundary,
      bufferDistanceM: zone.bufferDistanceM,
      status: zone.status,
      currentPricingConfigId: zone.currentPricingConfigId,
      createdAt: zone.createdAt.toISOString(),
      updatedAt: zone.updatedAt.toISOString(),
    };
  }
}
