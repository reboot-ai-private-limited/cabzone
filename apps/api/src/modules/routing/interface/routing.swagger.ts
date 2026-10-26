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

export const resolvedLocationSchema = z.object({
  point: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  country: z.string().nullable(),
  countryCode: z.string().nullable(),
  state: z.string().nullable(),
  stateCode: z.string().nullable(),
  city: z.string().nullable(),
  district: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  formattedAddress: z.string().optional().nullable(),
});

let registered = false;

export function registerRoutingSwaggerPaths(): void {
  if (registered) return;
  registered = true;
  registry.registerPath({
    method: 'get',
    path: '/v1/routing/reverse-geocode',
    tags: ['Routing & Geo'],
    summary: 'Reverse geocode a point coordinate to country, state, and city',
    request: {
      query: z.object({
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
      }),
    },
    responses: {
      200: {
        description: 'Resolved location details',
        content: { 'application/json': { schema: successResponse(resolvedLocationSchema) } },
      },
      400: {
        description: 'Invalid coordinates',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });
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
