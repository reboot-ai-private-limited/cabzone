import type { IncityPackageDto } from '@cabzone/contracts';
import { request } from '../client.js';

export const packagesApi = {
  async listIncity(
    token?: string,
    query?: Record<string, string | number | boolean | undefined>,
    signal?: AbortSignal,
  ): Promise<IncityPackageDto[]> {
    if (!token) return [];
    try {
      const res = await request<{ items?: IncityPackageDto[] } | IncityPackageDto[]>(
        '/v1/admin/packages/incity',
        {
          method: 'GET',
          token,
          query,
          signal,
        },
      );
      if (Array.isArray(res)) return res;
      return res.items ?? [];
    } catch {
      // Endpoint is optional / under roadmap, return empty list gracefully
      return [];
    }
  },
};
