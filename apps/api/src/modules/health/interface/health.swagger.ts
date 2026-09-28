import { z } from 'zod';
import { registry, successResponse } from '@/shared/http/swagger.util.js';

export const dependencyHealthSchema = z.object({
  status: z.enum(['HEALTHY', 'UNHEALTHY', 'DOWN']),
  latencyMs: z.number().optional(),
  message: z.string().optional(),
});

export const healthReportSchema = z.object({
  status: z.enum(['HEALTHY', 'DEGRADED', 'UNHEALTHY']),
  timestamp: z.string(),
  service: z.string(),
  version: z.string(),
  dependencies: z.record(z.string(), dependencyHealthSchema),
});

export function registerHealthSwaggerPaths(): void {
  registry.registerPath({
    method: 'get',
    path: '/health',
    tags: ['Health'],
    summary: 'System health probe and dependency status',
    responses: {
      200: {
        description: 'Health report',
        content: {
          'application/json': {
            schema: successResponse(healthReportSchema),
          },
        },
      },
    },
  });
}
