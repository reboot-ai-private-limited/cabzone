'use client';

import { useQuery } from '@tanstack/react-query';
import {
  statesApi,
  type StateBoundaryDto,
  type UpdateStateBody,
} from '@/lib/api/endpoints/states';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

/** Every state, including disabled ones. */
export function useAllStates() {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.states.admin(),
      fetch: (token, signal) => statesApi.listAll(token, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

export function useStateHistory(stateCode: string | null) {
  return useQuery({
    ...authedQueryOptions({
      queryKey: keys.states.history(stateCode ?? ''),
      fetch: (token, signal) => statesApi.history(token, stateCode ?? '', signal),
      staleTime: 0,
    }),
    enabled: stateCode !== null,
  });
}

/** Both edits and enable/disable bump `configVersion`, so everything under ['states'] is stale. */
export function useUpdateState(onDone?: (state: StateBoundaryDto) => void) {
  return useApiMutation<
    { state: StateBoundaryDto; body: UpdateStateBody },
    StateBoundaryDto
  >({
    call: (token, v) => statesApi.update(token, v.state.stateCode, v.state.configVersion, v.body),
    invalidates: [keys.states.all()],
    ...(onDone === undefined ? {} : { onSuccess: onDone }),
  });
}

export function useSetStateStatus(onDone?: (state: StateBoundaryDto) => void) {
  return useApiMutation<
    { state: StateBoundaryDto; action: 'activate' | 'deactivate' },
    StateBoundaryDto
  >({
    call: (token, v) => statesApi.setStatus(token, v.state.stateCode, v.state.configVersion, v.action),
    invalidates: [keys.states.all()],
    ...(onDone === undefined ? {} : { onSuccess: onDone }),
  });
}
