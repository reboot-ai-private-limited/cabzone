import type {
  CreateZoneRequest,
  ListZonesQuery,
  UpdateZoneMetadataRequest,
  ZoneDto,
  ZoneListResponse,
  ZoneType,
  ZoneViolationDto,
} from '@cabzone/contracts';
import type { Polygon } from '@cabzone/geo';
import { request } from '../client.js';

export interface ZonesListResult extends ZoneListResponse {
  zones: ZoneDto[];
}

export const zonesApi = {
  async list(
    token?: string,
    query?: ListZonesQuery,
    signal?: AbortSignal,
  ): Promise<ZonesListResult> {
    const res = await request<ZoneListResponse | ZoneDto[]>('/v1/admin/zones', {
      method: 'GET',
      token,
      query: query as Record<string, string | number | boolean | undefined>,
      signal,
    });

    const items: ZoneDto[] = Array.isArray(res)
      ? res
      : (res?.items ?? (res as { zones?: ZoneDto[] })?.zones ?? []);

    const pagination = Array.isArray(res)
      ? { page: 1, limit: items.length, total: items.length }
      : (res?.pagination ?? { page: 1, limit: items.length, total: items.length });

    return {
      items,
      zones: items,
      pagination,
    };
  },

  async create(
    token?: string,
    body?: CreateZoneRequest,
    idempotencyKey?: string,
  ): Promise<ZoneDto> {
    return request<ZoneDto>('/v1/admin/zones', {
      method: 'POST',
      body,
      token,
      idempotencyKey,
    });
  },

  async updateMetadata(
    token?: string,
    id?: string,
    patch?: UpdateZoneMetadataRequest,
  ): Promise<ZoneDto> {
    return request<ZoneDto>(`/v1/admin/zones/${id}`, {
      method: 'PATCH',
      body: patch,
      token,
    });
  },

  async updateGeometry(
    token?: string,
    id?: string,
    body?: { geometry: Polygon; expected_version?: number; expectedVersion?: number },
  ): Promise<ZoneDto> {
    const payload = {
      geometry: body?.geometry,
      expectedVersion: body?.expectedVersion ?? body?.expected_version ?? 1,
    };
    return request<ZoneDto>(`/v1/admin/zones/${id}/geometry`, {
      method: 'PATCH',
      body: payload,
      token,
    });
  },

  async validate(
    token?: string,
    body?: { type: ZoneType; geometry: Polygon; exclude_zone_id?: string; excludeZoneId?: string },
    signal?: AbortSignal,
  ): Promise<{ valid: boolean; violations: ZoneViolationDto[] }> {
    const payload = {
      type: body?.type,
      geometry: body?.geometry,
      excludeZoneId: body?.excludeZoneId ?? body?.exclude_zone_id,
    };
    return request<{ valid: boolean; violations: ZoneViolationDto[] }>(
      '/v1/admin/zones/validate',
      {
        method: 'POST',
        body: payload,
        token,
        signal,
      },
    );
  },

  async deactivate(token?: string, id?: string): Promise<unknown> {
    return request<unknown>(`/v1/admin/zones/${id}/deactivate`, {
      method: 'POST',
      body: {},
      token,
    });
  },

  async dependents(
    token?: string,
    id?: string,
    signal?: AbortSignal,
  ): Promise<{ warnings: string[] }> {
    return request<{ warnings: string[] }>(`/v1/admin/zones/${id}/dependents`, {
      method: 'GET',
      token,
      signal,
    }).catch(() => ({ warnings: [] }));
  },
};
