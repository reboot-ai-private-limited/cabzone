import type {
  CreatePricingConfigRequest,
  ListPricingConfigsQuery,
  PricingConfigDto,
  UpdatePricingConfigRequest,
} from '@cabzone/contracts';
import { request } from '../client.js';

export const pricingApi = {
  listConfigs: (query?: ListPricingConfigsQuery, token?: string) =>
    request<PricingConfigDto[]>('/v1/admin/pricing/configs', {
      method: 'GET',
      query: query as Record<string, string | number | boolean | undefined>,
      token,
    }),

  createConfig: (body: CreatePricingConfigRequest, token?: string) =>
    request<PricingConfigDto>('/v1/admin/pricing/configs', {
      method: 'POST',
      body,
      token,
    }),

  updateConfig: (id: string, body: UpdatePricingConfigRequest, token?: string) =>
    request<PricingConfigDto>(`/v1/admin/pricing/configs/${id}`, {
      method: 'PATCH',
      body,
      token,
    }),

  deleteConfig: (id: string, token?: string) =>
    request<{ id: string }>(`/v1/admin/pricing/configs/${id}`, {
      method: 'DELETE',
      token,
    }),

  activateConfig: (id: string, token?: string) =>
    request<PricingConfigDto>(`/v1/admin/pricing/configs/${id}/activate`, {
      method: 'POST',
      token,
    }),
};
