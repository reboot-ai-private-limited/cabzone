import type {
  CreateZoneInputDto,
  GeoJsonGeometry,
  GeoJsonPolygon,
  ZoneDto,
  ZoneType,
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

export interface CreateZoneDeps {
  zoneRepo: ZoneRepositoryPort;
  auditRepo?: ZoneAuditRepositoryPort;
  validateZoneUseCase?: ValidateZoneUseCase;
}

export class CreateZoneUseCase {
  private readonly validator: ValidateZoneUseCase;

  constructor(private readonly deps: CreateZoneDeps) {
    this.validator =
      deps.validateZoneUseCase ?? new ValidateZoneUseCase({ zoneRepo: deps.zoneRepo });
  }

  async execute(input: CreateZoneInputDto, actorId: string = 'system'): Promise<ZoneDto> {
    const zoneType = (input.zoneType ?? input.type) as ZoneType;
    if (!zoneType) {
      throw AppError.badRequest('Zone type must be provided (CITY, PICKUP, EXCLUSION).');
    }

    const rawGeometry = input.geometry ?? input.boundary;
    if (!rawGeometry) {
      throw AppError.badRequest('Zone geometry or boundary must be provided.');
    }

    let geometry: GeoJsonGeometry;
    try {
      geometry = normalizeGeoJson(rawGeometry);
    } catch (err: unknown) {
      throw AppError.badRequest((err as Error).message);
    }

    // 1. Validation Engine check (structural + conflicts)
    const validation = await this.validator.execute({
      type: zoneType,
      geometry,
    });

    if (!validation.valid) {
      const firstError = validation.violations.find((v) => v.severity === 'ERROR');
      throw AppError.badRequest(
        firstError ? `${firstError.code}: ${firstError.message}` : 'Zone geometry validation failed.',
      );
    }

    // 2. Validate Parent City relationships
    const parentCityZoneId = input.parentCityZoneId ?? null;

    if (zoneType === 'PICKUP') {
      if (!parentCityZoneId) {
        throw AppError.badRequest(
          'INVALID_PARENT_ZONE: PICKUP zone must specify a parent CITY zone.',
        );
      }
      const parent = await this.deps.zoneRepo.findById(parentCityZoneId);
      if (!parent || parent.zoneType !== 'CITY') {
        throw AppError.badRequest(
          'INVALID_PARENT_ZONE: Referenced parent city does not exist or is not a CITY zone.',
        );
      }
    } else if (zoneType === 'CITY' && parentCityZoneId) {
      throw AppError.badRequest('CITY zone cannot have a parent zone.');
    } else if (parentCityZoneId) {
      const parent = await this.deps.zoneRepo.findById(parentCityZoneId);
      if (!parent) {
        throw AppError.badRequest('INVALID_PARENT_ZONE: Referenced parent zone does not exist.');
      }
    }

    // 3. Format or generate zone code (e.g. SLG_WEST)
    const code = (input.code ?? this.generateCodeFromName(input.name)).toUpperCase();

    // Check code uniqueness
    const existingWithCode = await this.deps.zoneRepo.findByCode(code);
    if (existingWithCode && existingWithCode.status === 'ACTIVE') {
      throw AppError.conflict(`ZONE_CODE_EXISTS: Zone with code "${code}" already exists and is active.`);
    }

    const boundary: GeoJsonPolygon =
      geometry.type === 'Polygon'
        ? geometry
        : {
            type: 'Polygon',
            coordinates: (geometry.coordinates[0] as GeoJsonPolygon['coordinates']) ?? [],
          };

    const now = new Date();
    const zone: ZoneEntity = {
      id: newUuid(),
      name: input.name.trim(),
      code,
      zoneType,
      type: zoneType,
      parentCityZoneId,
      stateCode: input.stateCode.trim().toUpperCase(),
      geometry,
      boundary,
      bufferDistanceM: input.bufferDistanceM ?? null,
      status: 'ACTIVE',
      currentPricingConfigId: input.currentPricingConfigId ?? null,
      version: 1,
      supersedesZoneId: null,
      supersededByZoneId: null,
      createdBy: actorId,
      updatedBy: actorId,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.deps.zoneRepo.save(zone);

    // Write audit log
    if (this.deps.auditRepo) {
      await this.deps.auditRepo.save({
        id: newUuid(),
        zoneId: saved.id,
        action: 'CREATE',
        actorId,
        before: null,
        after: zoneEntityToDto(saved),
        reason: 'Initial zone creation',
        createdAt: now,
      });
    }

    return zoneEntityToDto(saved);
  }

  private generateCodeFromName(name: string): string {
    const slug = name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return slug || `ZONE_${newUuid().substring(0, 8).toUpperCase()}`;
  }
}
