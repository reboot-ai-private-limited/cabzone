'use client';

import { useQuery } from '@tanstack/react-query';
import { statesApi, type ImportStatesResult } from '@/lib/api/endpoints/states';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

/** Serviceable state borders (reference data, shown in yellow on the zones map). */
export function useStateBoundaries() {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.states.all(),
      fetch: (token, signal) => statesApi.list(token, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

export function useImportStateBoundaries(onDone?: (result: ImportStatesResult) => void) {
  return useApiMutation<{ geojson: unknown; sourceVersion?: string | null }, ImportStatesResult>({
    call: (token, vars) =>
      statesApi.import(token, {
        geojson: vars.geojson,
        source: 'ADMIN_UPLOAD',
        sourceVersion: vars.sourceVersion ?? null,
      }),
    invalidates: [keys.states.all()],
    ...(onDone === undefined ? {} : { onSuccess: onDone }),
  });
}
