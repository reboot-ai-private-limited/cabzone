import type { ZoneDto } from '@Cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import type { ZoneRepositoryPort } from '../../domain/index.js';
import { zoneEntityToDto } from '../../domain/index.js';

export interface GetZoneDeps {
  zoneRepo: ZoneRepositoryPort;
}

export class GetZoneUseCase {
  constructor(private readonly deps: GetZoneDeps) {}

  async execute(id: string): Promise<ZoneDto> {
    const zone = await this.deps.zoneRepo.findById(id);
    if (!zone) {
      throw AppError.notFound(`Zone with ID ${id} not found.`);
    }
    return zoneEntityToDto(zone);
  }
}
