import type { GeoJsonGeometry } from '@cabzone/geo';
import { request } from '../client.js';

export interface StateBoundaryDto {
  id: string;
  stateCode: string;
  stateName: string;
  geometry: GeoJsonGeometry;
  version: number;
  configVersion: number;
  status: 'ACTIVE' | 'INACTIVE';
  intrastateEnabled: boolean;
  interstateDropOffEnabled: boolean;
  source: string;
  sourceVersion: string | null;
}

export interface StateHistoryEntryDto {
  id: string;
  stateCode: string;
  action: 'IMPORTED' | 'UPDATED' | 'ACTIVATED' | 'DEACTIVATED';
  version: number;
  configVersion: number;
  source: string | null;
  sourceVersion: string | null;
  /** Present when an import replaced an existing border. */
  previousGeometry: GeoJsonGeometry | null;
  actorId?: string | null;
  at: string;
}

export interface UpdateStateBody {
  stateName?: string;
  intrastateEnabled?: boolean;
  interstateDropOffEnabled?: boolean;
}

export interface ImportStatesResult {
  imported: string[];
  /** Newly created states that start disabled (not serviceable until enabled). */
  disabledOnImport: string[];
  /** Imported states whose border had self-crossings that were automatically repaired. */
  repaired: string[];
  rejected: { stateCode: string; reason: string }[];
  missing: string[];
}

const base = '/v1/admin/reference/states';

export const statesApi = {
  /** Every state including disabled ones, for the States admin screen. */
  async listAll(token?: string, signal?: AbortSignal): Promise<StateBoundaryDto[]> {
    const res = await request<{ states: StateBoundaryDto[] }>(base, {
      method: 'GET',
      query: { includeInactive: true },
      token,
      signal,
    });
    return res.states;
  },

  async update(
    token: string | undefined,
    stateCode: string,
    expectedVersion: number,
    body: UpdateStateBody,
  ): Promise<StateBoundaryDto> {
    const res = await request<{ state: StateBoundaryDto }>(`${base}/${stateCode}`, {
      method: 'PATCH',
      body: { ...body, expectedVersion },
      token,
    });
    return res.state;
  },

  async setStatus(
    token: string | undefined,
    stateCode: string,
    expectedVersion: number,
    action: 'activate' | 'deactivate',
  ): Promise<StateBoundaryDto> {
    const res = await request<{ state: StateBoundaryDto }>(`${base}/${stateCode}/${action}`, {
      method: 'POST',
      body: { expectedVersion },
      token,
    });
    return res.state;
  },

  async history(
    token: string | undefined,
    stateCode: string,
    signal?: AbortSignal,
  ): Promise<StateHistoryEntryDto[]> {
    const res = await request<{ history: StateHistoryEntryDto[] }>(`${base}/${stateCode}/history`, {
      method: 'GET',
      token,
      signal,
    });
    return res.history;
  },

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
