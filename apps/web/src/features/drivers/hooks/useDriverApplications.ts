'use client';

import { useQuery } from '@tanstack/react-query';
import {
  driversApi,
  type DriverApplicationSummaryDto,
  type ListDriverApplicationsQuery,
  type ReviewApplicationBody,
  type UpdateDriverProfileBody,
} from '@/lib/api/endpoints/drivers';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

export function useDriverApplications(filter: ListDriverApplicationsQuery = {}) {
  return useQuery(
    authedQueryOptions<DriverApplicationSummaryDto[]>({
      queryKey: keys.drivers.applications(filter),
      fetch: (token, signal) => driversApi.listApplications(filter, token, signal),
      staleTime: staleTime.short,
    }),
  );
}

export function useDriverApplication(id: string | null) {
  return useQuery({
    ...authedQueryOptions({
      queryKey: keys.drivers.application(id ?? ''),
      fetch: (token, signal) => driversApi.getApplication(id ?? '', token, signal),
      staleTime: 0,
    }),
    enabled: id !== null,
  });
}

export function useReviewApplication(onDone?: () => void) {
  return useApiMutation<{ id: string; body: ReviewApplicationBody }, unknown>({
    call: (token, v) => driversApi.review(v.id, v.body, token),
    invalidates: [keys.drivers.all()],
    ...(onDone === undefined ? {} : { onSuccess: onDone }),
  });
}

export function useUpdateDriverStatus(onDone?: () => void) {
  return useApiMutation<
    { id: string; status: 'ACTIVE' | 'SUSPENDED'; reason?: string | null },
    unknown
  >({
    call: (token, v) =>
      driversApi.updateStatus(v.id, { status: v.status, reason: v.reason }, token),
    invalidates: [keys.drivers.all()],
    ...(onDone === undefined ? {} : { onSuccess: onDone }),
  });
}


export function useUpdateDriverProfile(onDone?: () => void) {
  return useApiMutation<
    { id: string; body: UpdateDriverProfileBody },
    unknown
  >({
    call: (token, v) => driversApi.updateDriverProfile(v.id, v.body, token),
    invalidates: [keys.drivers.all()],
    ...(onDone === undefined ? {} : { onSuccess: onDone }),
  });
}
