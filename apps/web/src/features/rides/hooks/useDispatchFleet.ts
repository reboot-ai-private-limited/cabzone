'use client';

import { useQuery } from '@tanstack/react-query';
import type { SimulateFleetPayload, SimulateFleetResponseDto } from '@cabzone/contracts';
import { dispatchApi, type ListFleetQuery } from '@/lib/api/endpoints/dispatch';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

const FLEET_REFRESH_MS = 5_000;

export function useDispatchFleet(query?: ListFleetQuery) {
  return useQuery({
    ...authedQueryOptions({
      queryKey: keys.dispatch.fleet(query),
      fetch: (token, signal) => dispatchApi.getFleet(query, token, signal),
      staleTime: 0,
    }),
    refetchInterval: FLEET_REFRESH_MS,
  });
}

export function useSimulateFleet() {
  return useApiMutation<SimulateFleetPayload | undefined, SimulateFleetResponseDto>({
    call: (token, payload) => dispatchApi.simulateFleet(payload, token),
    invalidates: [keys.dispatch.all()],
  });
}
