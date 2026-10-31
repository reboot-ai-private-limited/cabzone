'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  AdminRiderDetailDto,
  AdminRiderSummaryDto,
  AdminUpdateRiderProfileDto,
  ListRidersQueryDto,
  ListRidersResponseDto,
  UpdateRiderStatusDto,
} from '@cabzone/contracts';
import { ridersApi } from '@/lib/api/endpoints/riders';
import { ridesApi, type AdminRideDto } from '@/lib/api/endpoints/rides';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

export function useRidersList(query: ListRidersQueryDto = {}) {
  return useQuery(
    authedQueryOptions<ListRidersResponseDto>({
      queryKey: keys.riders.list(query),
      fetch: (token, signal) => ridersApi.list(query, token, signal),
      staleTime: staleTime.short,
    }),
  );
}

export function useRiderDetail(id: string | null) {
  return useQuery({
    ...authedQueryOptions<AdminRiderDetailDto>({
      queryKey: keys.riders.detail(id ?? ''),
      fetch: (token, signal) => ridersApi.get(id ?? '', token, signal),
      staleTime: 0,
    }),
    enabled: id !== null && id.length > 0,
  });
}

export function useRiderRides(riderId: string | null) {
  return useQuery({
    ...authedQueryOptions<AdminRideDto[]>({
      queryKey: keys.riders.rides(riderId ?? ''),
      fetch: (token, signal) =>
        ridesApi.list({ limit: 50, riderId: riderId ?? undefined }, token, signal),
      staleTime: staleTime.short,
    }),
    enabled: riderId !== null && riderId.length > 0,
  });
}

export function useUpdateRiderStatus(onDone?: () => void) {
  return useApiMutation<{ id: string; body: UpdateRiderStatusDto }, AdminRiderSummaryDto>({
    call: (token, v) => ridersApi.updateStatus(v.id, v.body, token),
    invalidates: [keys.riders.all()],
    ...(onDone === undefined ? {} : { onSuccess: onDone }),
  });
}

export function useUpdateRiderProfile(onDone?: () => void) {
  return useApiMutation<{ id: string; body: AdminUpdateRiderProfileDto }, AdminRiderDetailDto>({
    call: (token, v) => ridersApi.updateProfile(v.id, v.body, token),
    invalidates: [keys.riders.all()],
    ...(onDone === undefined ? {} : { onSuccess: onDone }),
  });
}
