import type { ZoneDto, ZoneListResponse } from '@Cabzone/contracts';
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

  async executePaginated(filter?: ZoneFilter): Promise<ZoneListResponse> {
    if (this.deps.zoneRepo.listPaginated) {
      const { items, total } = await this.deps.zoneRepo.listPaginated(filter);
      const page = Math.max(1, filter?.page ?? 1);
      const limit = Math.max(1, Math.min(100, filter?.limit ?? 20));
      return {
        items: items.map(zoneEntityToDto),
        pagination: {
          page,
          limit,
          total,
        },
      };
    }

    const all = await this.deps.zoneRepo.list(filter);
    const total = all.length;
    const page = Math.max(1, filter?.page ?? 1);
    const limit = Math.max(1, Math.min(100, filter?.limit ?? 20));
    const offset = (page - 1) * limit;
    const items = all.slice(offset, offset + limit).map(zoneEntityToDto);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
      },
    };
  }
}
