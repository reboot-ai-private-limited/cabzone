import type { ZoneDto } from '@cabzone/contracts';
import type { ZoneFilter, ZoneRepositoryPort } from '../../domain/index.js';
import { zoneEntityToDto } from '../../domain/index.js';

export interface ListZonesDeps {
  zoneRepo: ZoneRepositoryPort;
}

export class ListZonesUseCase {
  constructor(private readonly deps: ListZonesDeps) {}

  async execute(filter?: ZoneFilter): Promise<ZoneDto[]> {
    const zones = await this.deps.zoneRepo.list(filter);
    return zones.map(zoneEntityToDto);
  }
}
