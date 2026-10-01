import { z } from 'zod';
import { registry, successResponse, errorResponse, bearerAuth } from '../../../shared/http/swagger.util.js';

export const routingHealthSchema = z.object({
  provider: z.string(),
  configured: z.boolean(),
});

export const routingMetricsSchema = z.object({
  provider: z.string(),
  requests: z.number().int(),
  failures: z.number().int(),
  cacheHits: z.number().int(),
  totalLatencyMs: z.number().int(),
  averageLatencyMs: z.number().int(),
});

export function registerRoutingSwaggerPaths(): void {
  registry.registerPath({
    method: 'get',
    path: '/v1/admin/routing/health',
    tags: ['Admin Routing'],
    summary: 'Get routing provider configuration health',
    security: bearerAuth,
    responses: {
      200: {
        description: 'Routing provider health',
        content: { 'application/json': { schema: successResponse(routingHealthSchema) } },
      },
      401: {
        description: 'Authentication required',
        content: { 'application/json': { schema: errorResponse } },
      },
      403: {
        description: 'Insufficient permissions',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/v1/admin/routing/metrics',
    tags: ['Admin Routing'],
    summary: 'Get routing counters and latency metrics',
    security: bearerAuth,
    responses: {
      200: {
        description: 'Routing metrics',
        content: { 'application/json': { schema: successResponse(routingMetricsSchema) } },
      },
      401: {
        description: 'Authentication required',
        content: { 'application/json': { schema: errorResponse } },
      },
      403: {
        description: 'Insufficient permissions',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });
}
