'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  CreatePricingConfigRequest,
  ListPricingConfigsQuery,
  PricingConfigDto,
  UpdatePricingConfigRequest,
} from '@cabzone/contracts';
import { pricingApi } from '@/lib/api/endpoints/pricing.js';
import { authedQueryOptions } from '@/lib/query/factory.js';
import { keys, staleTime } from '@/lib/query/keys.js';
import { useApiMutation } from '@/lib/query/mutation.js';

export function usePricingConfigs(query?: ListPricingConfigsQuery) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.pricing.configs(query),
      fetch: (token) => pricingApi.listConfigs(query, token),
      staleTime: staleTime.configuration,
      refetchOnWindowFocus: true,
    }),
  );
}

export function useCreatePricingConfig(onSuccess?: (config: PricingConfigDto) => void) {
  return useApiMutation<CreatePricingConfigRequest, PricingConfigDto>({
    call: (token, body) => pricingApi.createConfig(body, token),
    invalidates: [keys.pricing.all()],
    successMessage: 'Pricing rule created.',
    ...(onSuccess ? { onSuccess } : {}),
  });
}

export function useUpdatePricingConfig(onSuccess?: (config: PricingConfigDto) => void) {
  return useApiMutation<{ id: string; body: UpdatePricingConfigRequest }, PricingConfigDto>({
    call: (token, { id, body }) => pricingApi.updateConfig(id, body, token),
    invalidates: [keys.pricing.all()],
    successMessage: 'Pricing rule updated.',
    ...(onSuccess ? { onSuccess } : {}),
  });
}

export function useDeletePricingConfig(onSuccess?: () => void) {
  return useApiMutation<string, { id: string }>({
    call: (token, id) => pricingApi.deleteConfig(id, token),
    invalidates: [keys.pricing.all()],
    successMessage: 'Pricing rule deleted.',
    ...(onSuccess ? { onSuccess: () => onSuccess() } : {}),
  });
}

export function useActivatePricingConfig(onSuccess?: (config: PricingConfigDto) => void) {
  return useApiMutation<string, PricingConfigDto>({
    call: (token, id) => pricingApi.activateConfig(id, token),
    invalidates: [keys.pricing.all()],
    successMessage: 'Pricing rule activated.',
    ...(onSuccess ? { onSuccess } : {}),
  });
}

