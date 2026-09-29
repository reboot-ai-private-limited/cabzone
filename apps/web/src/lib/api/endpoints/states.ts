import type { GeoJsonGeometry } from '@cabzone/geo';
import { request } from '../client.js';

export interface StateBoundaryDto {
  id: string;
  stateCode: string;
  stateName: string;
  geometry: GeoJsonGeometry;
  version: number;
  status: 'ACTIVE' | 'INACTIVE';
  source: string;
  sourceVersion: string | null;
}

export interface ImportStatesResult {
  imported: string[];
  skippedNotServiceable: string[];
  rejected: { stateCode: string; reason: string }[];
  missing: string[];
}

export const statesApi = {
  async list(token?: string, signal?: AbortSignal): Promise<StateBoundaryDto[]> {
    const res = await request<{ states: StateBoundaryDto[] }>('/v1/admin/reference/states', {
      method: 'GET',
      token,
      signal,
    });
    return res.states;
  },

  async import(
    token: string | undefined,
    body: { geojson: unknown; source?: string; sourceVersion?: string | null },
  ): Promise<ImportStatesResult> {
    return request<ImportStatesResult>('/v1/admin/reference/states/import', {
      method: 'POST',
      body,
      token,
    });
  },
};
