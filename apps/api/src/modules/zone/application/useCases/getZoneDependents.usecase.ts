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
        'Deactivating this CITY zone will disable all in-city rides and hourly packages operating within this city area.',
      );
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
