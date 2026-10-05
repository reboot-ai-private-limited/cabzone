import type {
  AdminRolePermissionDto,
  AdminUserDetailDto,
  AdminUserSummaryDto,
  CreateAdminUserDto,
  ListAdminUsersQueryDto,
  ListAdminUsersResponseDto,
  UpdateAdminUserDto,
  UpdateAdminUserStatusDto,
} from '@cabzone/contracts';
import { request } from '../client.js';

export const adminsApi = {
  list: (query?: ListAdminUsersQueryDto, token?: string, signal?: AbortSignal) =>
    request<ListAdminUsersResponseDto>('/v1/admin/users', {
      method: 'GET',
      query: {
        search: query?.search,
        role: query?.role,
        status: query?.status,
        zoneId: query?.zoneId,
        limit: query?.limit,
        offset: query?.offset,
      },
      token,
      signal,
    }),

  get: (id: string, token?: string, signal?: AbortSignal) =>
    request<AdminUserDetailDto>(`/v1/admin/users/${id}`, {
      method: 'GET',
      token,
      signal,
    }),

  create: (body: CreateAdminUserDto, token?: string) =>
    request<AdminUserDetailDto>('/v1/admin/users', {
      method: 'POST',
      body,
      token,
    }),

  update: (id: string, body: UpdateAdminUserDto, token?: string) =>
    request<AdminUserDetailDto>(`/v1/admin/users/${id}`, {
      method: 'PATCH',
      body,
      token,
    }),

  updateStatus: (id: string, body: UpdateAdminUserStatusDto, token?: string) =>
    request<AdminUserSummaryDto>(`/v1/admin/users/${id}/status`, {
      method: 'PATCH',
      body,
      token,
    }),

  getPermissions: (token?: string, signal?: AbortSignal) =>
    request<AdminRolePermissionDto[]>('/v1/admin/users/roles/permissions', {
      method: 'GET',
      token,
      signal,
    }),
};
