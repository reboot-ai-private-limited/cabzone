import type {
  AdminRiderDetailDto,
  AdminRiderSummaryDto,
  ListRidersQueryDto,
  ListRidersResponseDto,
  UpdateRiderProfileDto,
  UpdateRiderStatusDto,
} from '@cabzone/contracts';
import { request } from '../client.js';

export const ridersApi = {
  list: (query: ListRidersQueryDto, token?: string, signal?: AbortSignal) =>
    request<ListRidersResponseDto>('/v1/admin/riders', {
      method: 'GET',
      query: {
        search: query.search,
        status: query.status,
        limit: query.limit,
        offset: query.offset,
      },
      token,
      signal,
    }),

  get: (id: string, token?: string, signal?: AbortSignal) =>
    request<AdminRiderDetailDto>(`/v1/admin/riders/${id}`, {
      method: 'GET',
      token,
      signal,
    }),

  updateStatus: (id: string, body: UpdateRiderStatusDto, token?: string) =>
    request<AdminRiderSummaryDto>(`/v1/admin/riders/${id}/status`, {
      method: 'PATCH',
      body,
      token,
    }),

  updateProfile: (id: string, body: UpdateRiderProfileDto, token?: string) =>
    request<AdminRiderDetailDto>(`/v1/admin/riders/${id}`, {
      method: 'PATCH',
      body,
      token,
    }),
};
