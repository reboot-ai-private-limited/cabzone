'use client';

import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

export interface UseApiMutationOptions<TVariables, TData> {
  call: (
    token: string | undefined,
    variables: TVariables,
    idempotencyKey?: string,
  ) => Promise<TData>;
  invalidates?: QueryKey[];
  successMessage?: string;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: unknown, variables: TVariables) => void;
}

export function useApiMutation<TVariables = void, TData = unknown>(
  options: UseApiMutationOptions<TVariables, TData>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: TVariables): Promise<TData> => {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('Cabzone_access_token') ?? undefined
          : undefined;
      const idempotencyKey =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : undefined;

      return options.call(token, variables, idempotencyKey);
    },
    onSuccess: (data, variables) => {
      if (options.invalidates && options.invalidates.length > 0) {
        for (const queryKey of options.invalidates) {
          void queryClient.invalidateQueries({ queryKey });
        }
      }
      options.onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      options.onError?.(error, variables);
    },
  });
}
