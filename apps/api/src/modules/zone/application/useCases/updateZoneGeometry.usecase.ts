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

    // Overwrite the existing zone in place; no new version is created.
    const updated: ZoneEntity = {
      ...existing,
      geometry,
      boundary,
      updatedBy: actorId,
      updatedAt: now,
    };
    const saved = await this.deps.zoneRepo.save(updated);

    // 5. Record audit log
    if (this.deps.auditRepo) {
      await this.deps.auditRepo.save({
        id: newUuid(),
        zoneId: saved.id,
        action: 'UPDATE_GEOMETRY',
        actorId,
        before: { zoneId: existing.id, geometry: existing.geometry },
        after: { zoneId: saved.id, geometry: saved.geometry },
        reason: 'Geometry updated',
        createdAt: now,
      });
    }

    return zoneEntityToDto(saved);
  }
}

type UpdateZoneDeps = UpdateZoneGeometryDeps;
