import type { QueryFunctionContext, QueryKey } from '@tanstack/react-query';

export interface AuthedQueryConfig<TData, TQueryKey extends QueryKey = QueryKey> {
  queryKey: TQueryKey;
  fetch: (token: string | undefined, signal?: AbortSignal) => Promise<TData>;
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
  enabled?: boolean;
}

export function authedQueryOptions<TData, TQueryKey extends QueryKey = QueryKey>(
  config: AuthedQueryConfig<TData, TQueryKey>,
) {
  return {
    queryKey: config.queryKey,
    queryFn: async ({ signal }: QueryFunctionContext<TQueryKey>): Promise<TData> => {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('Cabzonee_access_token') ?? undefined
          : undefined;
      return config.fetch(token, signal);
    },
    staleTime: config.staleTime,
    refetchOnWindowFocus: config.refetchOnWindowFocus,
    enabled: config.enabled,
  };
}
