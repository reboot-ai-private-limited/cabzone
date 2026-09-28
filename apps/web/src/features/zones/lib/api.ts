import { request } from '../../../lib/api/client.js';
import type {
  CreateZoneInputDto,
  UpdateZoneGeometryRequest,
  UpdateZoneMetadataRequest,
  ValidateZoneRequest,
  ZoneAuditDto,
  ZoneDto,
  ZoneListQuery,
  ZoneListResponse,
  ZoneValidationResult,
} from '../types/zones.js';

export async function getZones(query: ZoneListQuery = {}): Promise<ZoneListResponse> {
  const queryParams: Record<string, string | number | boolean | undefined> = {};
  if (query.type && query.type !== ('ALL' as unknown)) queryParams['type'] = query.type;
  if (query.status && query.status !== ('ALL' as unknown)) queryParams['status'] = query.status;
  if (query.search) queryParams['search'] = query.search;
  if (query.page) queryParams['page'] = query.page;
  if (query.limit) queryParams['limit'] = query.limit;

  const data = await request<ZoneListResponse | ZoneDto[]>('/v1/admin/zones', {
    method: 'GET',
    query: queryParams,
  });

  if (Array.isArray(data)) {
    return {
      items: data,
      pagination: {
        page: query.page ?? 1,
        limit: query.limit ?? data.length,
        total: data.length,
      },
    };
  }

  return data;
}

export async function getZoneById(id: string): Promise<ZoneDto> {
  return request<ZoneDto>(`/v1/admin/zones/${id}`, {
    method: 'GET',
  });
}

export async function createZone(input: CreateZoneInputDto): Promise<ZoneDto> {
  return request<ZoneDto>('/v1/admin/zones', {
    method: 'POST',
    body: input,
  });
}

export async function validateZone(input: ValidateZoneRequest): Promise<ZoneValidationResult> {
  return request<ZoneValidationResult>('/v1/admin/zones/validate', {
    method: 'POST',
    body: input,
  });
}

export async function updateZoneMetadata(
  id: string,
  input: UpdateZoneMetadataRequest,
): Promise<ZoneDto> {
  return request<ZoneDto>(`/v1/admin/zones/${id}`, {
    method: 'PATCH',
    body: input,
  });
}

export async function updateZoneGeometry(
  id: string,
  input: UpdateZoneGeometryRequest,
): Promise<ZoneDto> {
  return request<ZoneDto>(`/v1/admin/zones/${id}/geometry`, {
    method: 'PATCH',
    body: input,
  });
}

export async function activateZone(id: string): Promise<ZoneDto> {
  return request<ZoneDto>(`/v1/admin/zones/${id}/activate`, {
    method: 'POST',
  });
}

export async function deactivateZone(id: string, reason?: string): Promise<ZoneDto> {
  return request<ZoneDto>(`/v1/admin/zones/${id}/deactivate`, {
    method: 'POST',
    body: { reason },
  });
}

export async function getZoneHistory(
  id: string,
): Promise<{ versions: ZoneDto[]; auditLogs: ZoneAuditDto[] }> {
  return request<{ versions: ZoneDto[]; auditLogs: ZoneAuditDto[] }>(
    `/v1/admin/zones/${id}/history`,
    {
      method: 'GET',
    },
  );
}
