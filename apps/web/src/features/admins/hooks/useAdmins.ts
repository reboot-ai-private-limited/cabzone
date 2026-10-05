'use client';

import { useQuery } from '@tanstack/react-query';
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
import { adminsApi } from '@/lib/api/endpoints/admins';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

export function useAdminsList(query: ListAdminUsersQueryDto = {}) {
  return useQuery(
    authedQueryOptions<ListAdminUsersResponseDto>({
      queryKey: keys.admins.list(query),
      fetch: (token, signal) => adminsApi.list(query, token, signal),
      staleTime: staleTime.short,
    }),
  );
}

export function useAdminDetail(id: string | null) {
  return useQuery({
    ...authedQueryOptions<AdminUserDetailDto>({
      queryKey: keys.admins.detail(id ?? ''),
      fetch: (token, signal) => adminsApi.get(id ?? '', token, signal),
      staleTime: 0,
    }),
    enabled: id !== null && id.length > 0,
  });
}

export function useRolePermissions() {
  return useQuery(
    authedQueryOptions<AdminRolePermissionDto[]>({
      queryKey: keys.admins.permissions(),
      fetch: (token, signal) => adminsApi.getPermissions(token, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

export function useCreateAdmin(onDone?: () => void) {
  return useApiMutation<CreateAdminUserDto, AdminUserDetailDto>({
    call: (token, v) => adminsApi.create(v, token),
    invalidates: [keys.admins.all()],
    ...(onDone === undefined ? {} : { onSuccess: onDone }),
  });
}

export function useUpdateAdmin(onDone?: () => void) {
  return useApiMutation<{ id: string; body: UpdateAdminUserDto }, AdminUserDetailDto>({
    call: (token, v) => adminsApi.update(v.id, v.body, token),
    invalidates: [keys.admins.all()],
    ...(onDone === undefined ? {} : { onSuccess: onDone }),
  });
}

export function useUpdateAdminStatus(onDone?: () => void) {
  return useApiMutation<{ id: string; body: UpdateAdminUserStatusDto }, AdminUserSummaryDto>({
    call: (token, v) => adminsApi.updateStatus(v.id, v.body, token),
    invalidates: [keys.admins.all()],
    ...(onDone === undefined ? {} : { onSuccess: onDone }),
  });
}
