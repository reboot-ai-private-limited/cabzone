import type { HealthReport } from '@cabzone/contracts';
import { request } from '../client.js';

export interface RoutingHealthDto {
  provider: string;
  configured: boolean;
}

export interface RoutingMetricsDto {
  provider: string;
  requests: number;
  cacheHits: number;
  failures: number;
  totalLatencyMs: number;
  averageLatencyMs: number;
}

export const healthApi = {
  getServiceHealth: (signal?: AbortSignal) =>
    request<HealthReport>('/health', { method: 'GET', signal }),

  getRoutingHealth: (token?: string, signal?: AbortSignal) =>
    request<RoutingHealthDto>('/v1/admin/routing/health', { method: 'GET', token, signal }),

  getRoutingMetrics: (token?: string, signal?: AbortSignal) =>
    request<RoutingMetricsDto>('/v1/admin/routing/metrics', { method: 'GET', token, signal }),
};
