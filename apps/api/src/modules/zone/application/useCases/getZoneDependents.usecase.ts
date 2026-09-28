import type { ZoneRepositoryPort } from '../../domain/index.js';

export interface GetZoneDependentsDeps {
  zoneRepo: ZoneRepositoryPort;
}

export interface ZoneDependentsResult {
  warnings: string[];
}

export class GetZoneDependentsUseCase {
  constructor(private readonly deps: GetZoneDependentsDeps) {}

  async execute(zoneId: string): Promise<ZoneDependentsResult> {
    const zone = await this.deps.zoneRepo.findById(zoneId);
    if (!zone) {
      return { warnings: [] };
    }

    const warnings: string[] = [];

    if (zone.zoneType === 'CITY') {
      warnings.push(
        'Deactivating this CITY zone will disable all rides and hourly packages operating within this city area.',
      );
    }

    if (zone.zoneType === 'PICKUP') {
      const activePickups = await this.deps.zoneRepo.list({
        type: 'PICKUP',
        status: 'ACTIVE',
      });
      if (activePickups.length <= 1) {
        warnings.push(
          'This is the LAST active pickup zone. Deactivating it will prevent all new ride pickups across the entire service area.',
        );
      }
    }

    const childZones = await this.deps.zoneRepo.list({
      parentCityZoneId: zone.id,
      status: 'ACTIVE',
    });
    if (childZones.length > 0) {
      warnings.push(
        `${childZones.length} active zone(s) have this zone designated as their parent city zone.`,
      );
    }

    return { warnings };
  }
}
