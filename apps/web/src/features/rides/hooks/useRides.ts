'use client';

import { useQuery } from '@tanstack/react-query';
import type { RideStatus } from '@cabzone/contracts';
import { type DisputeQueueStatus, ridesApi } from '@/lib/api/endpoints/rides';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys } from '@/lib/query/keys';

const LIVE_REFRESH_MS = 10_000;

/** Rides list that refreshes itself: this screen is a live operations view. */
export function useRides(filter: { statuses?: RideStatus[]; limit: number }) {
  return useQuery({
    ...authedQueryOptions({
      queryKey: keys.rides.list(filter),
      fetch: (token, signal) => ridesApi.list(filter, token, signal),
      staleTime: 0,
    }),
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useRideEvents(rideId: string | null) {
  return useQuery({
    ...authedQueryOptions({
      queryKey: keys.rides.events(rideId ?? ''),
      fetch: (token, signal) => ridesApi.events(rideId ?? '', token, signal),
      staleTime: 0,
    }),
    enabled: rideId !== null,
  });
}

export function usePaymentDisputes(status: DisputeQueueStatus, enabled = true) {
  return useQuery({
    ...authedQueryOptions({
      queryKey: keys.rides.disputes(status),
      fetch: (token, signal) => ridesApi.listPaymentDisputes(status, token, signal),
      staleTime: 0,
    }),
    enabled,
    refetchInterval: enabled ? LIVE_REFRESH_MS : false,
  });
}
