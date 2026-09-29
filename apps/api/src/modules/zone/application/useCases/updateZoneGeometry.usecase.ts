import type {
  GeoJsonGeometry,
  GeoJsonPolygon,
  UpdateZoneGeometryRequest,
  ZoneDto,
} from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type {
  ZoneAuditRepositoryPort,
  ZoneEntity,
  ZoneRepositoryPort,
} from '../../domain/index.js';
import { normalizeGeoJson, zoneEntityToDto } from '../../domain/index.js';
import { ValidateZoneUseCase } from './validateZone.usecase.js';

export interface UpdateZoneGeometryDeps {
  zoneRepo: ZoneRepositoryPort;
  auditRepo?: ZoneAuditRepositoryPort;
  validateZoneUseCase?: ValidateZoneUseCase;
}

export class UpdateZoneGeometryUseCase {
  private readonly validator: ValidateZoneUseCase;

  constructor(private readonly deps: UpdateZoneDeps) {
    this.validator =
      deps.validateZoneUseCase ?? new ValidateZoneUseCase({ zoneRepo: deps.zoneRepo });
  }

  async execute(
    id: string,
    input: UpdateZoneGeometryRequest,
    actorId: string = 'system',
  ): Promise<ZoneDto> {
    const existing = await this.deps.zoneRepo.findById(id);
    if (!existing) {
      throw AppError.notFound(`Zone with ID ${id} not found.`);
    }

    // 1. Optimistic Concurrency & Active Status Check
    if (existing.status !== 'ACTIVE' || existing.supersededByZoneId) {
      throw AppError.conflict(
        `ZONE_VERSION_CONFLICT: Zone version ${existing.version} has already been superseded or deactivated. Please refresh to edit the active version.`,
      );
    }

    if (existing.version !== input.expectedVersion) {
      throw AppError.conflict(
        `ZONE_VERSION_CONFLICT: Zone version mismatch. Expected version ${input.expectedVersion} but current version is ${existing.version}. Please refresh before saving.`,
      );
    }

    let geometry: GeoJsonGeometry;
    try {
      geometry = normalizeGeoJson(input.geometry);
    } catch (err: unknown) {
      throw AppError.badRequest((err as Error).message);
    }

    // 2. Validate new geometry & conflicts (excluding current zone from self-conflict)
    const validation = await this.validator.execute({
      type: existing.zoneType,
      geometry,
      excludeZoneId: existing.id,
    });

    if (!validation.valid) {
      const firstError = validation.violations.find((v) => v.severity === 'ERROR');
      throw AppError.badRequest(
        firstError ? `${firstError.code}: ${firstError.message}` : 'Zone geometry validation failed.',
      );
    }

    const boundary: GeoJsonPolygon =
      geometry.type === 'Polygon'
        ? geometry
        : {
            type: 'Polygon',
            coordinates: (geometry.coordinates[0] as GeoJsonPolygon['coordinates']) ?? [],
          };

    const now = new Date();
    const newVersionNumber = existing.version + 1;
    const newZoneId = newUuid();

    // 3. Mark old version as inactive / superseded
    const oldZoneUpdated: ZoneEntity = {
      ...existing,
      status: 'INACTIVE',
      supersededByZoneId: newZoneId,
      updatedBy: actorId,
      updatedAt: now,
    };
    await this.deps.zoneRepo.save(oldZoneUpdated);

    // 4. Create new version as ACTIVE
    const newZone: ZoneEntity = {
      id: newZoneId,
      name: existing.name,
      code: existing.code,
      zoneType: existing.zoneType,
      type: existing.zoneType,
      parentCityZoneId: existing.parentCityZoneId,
      stateCode: existing.stateCode,
      geometry,
      boundary,
      bufferDistanceM: existing.bufferDistanceM,
      status: 'ACTIVE',
      currentPricingConfigId: existing.currentPricingConfigId,
      version: newVersionNumber,
      supersedesZoneId: existing.id,
      supersededByZoneId: null,
      createdBy: existing.createdBy,
      updatedBy: actorId,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.deps.zoneRepo.save(newZone);

    // 5. Record audit log
    if (this.deps.auditRepo) {
      await this.deps.auditRepo.save({
        id: newUuid(),
        zoneId: newZone.id,
        action: 'UPDATE_GEOMETRY',
        actorId,
        before: {
          zoneId: existing.id,
          version: existing.version,
          geometry: existing.geometry,
        },
        after: {
          zoneId: saved.id,
          version: saved.version,
          geometry: saved.geometry,
        },
        reason: `Geometry updated from v${existing.version} to v${newVersionNumber}`,
        createdAt: now,
      });
    }

    return zoneEntityToDto(saved);
  }
}

type UpdateZoneDeps = UpdateZoneGeometryDeps;
