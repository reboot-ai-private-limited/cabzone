import { z } from 'zod';
import { ZONE_STATUSES, ZONE_TYPES } from '@cabzone/contracts';
import { registry, successResponse, errorResponse, bearerAuth } from '@/shared/http/swagger.util.js';
import {
  createZoneSchema,
  validateZoneSchema,
  updateZoneSchema,
  updateZoneGeometrySchema,
  deactivateZoneSchema,
  listZonesQuerySchema,
  zoneIdParamSchema,
  resolveZonesRequestSchema,
  geoJsonGeometrySchema,
} from './zone.validation.js';

export const zoneDtoSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  type: z.enum(ZONE_TYPES),
  status: z.enum(ZONE_STATUSES),
  stateCode: z.string().length(2),
  parentCityZoneId: z.string().uuid().nullable().optional(),
  bufferDistanceM: z.number().nullable().optional(),
  geometry: geoJsonGeometrySchema,
  version: z.number().int(),
  supersedesZoneId: z.string().uuid().nullable().optional(),
  supersededByZoneId: z.string().uuid().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const zoneResolutionResultSchema = z.object({
  pickupZoneId: z.string().uuid().nullable(),
  dropZoneId: z.string().uuid().nullable(),
  pickupCityZoneId: z.string().uuid().nullable(),
  dropCityZoneId: z.string().uuid().nullable(),
  isInExclusionZone: z.boolean(),
  nearestCityZoneId: z.string().uuid().nullable(),
  isWithinBuffer: z.boolean(),
});

export function registerZoneSwaggerPaths(): void {
  // Public zone resolution
  registry.registerPath({
    method: 'post',
    path: '/v1/zones/resolve',
    tags: ['Zones'],
    summary: 'Authoritatively resolve pickup and drop locations to active zones',
    request: {
      body: {
        content: {
          'application/json': {
            schema: resolveZonesRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Resolved zones for pickup and drop coordinates',
        content: {
          'application/json': {
            schema: successResponse(zoneResolutionResultSchema),
          },
        },
      },
      400: {
        description: 'Validation failed',
        content: {
          'application/json': {
            schema: errorResponse,
          },
        },
      },
    },
  });

  // Admin list zones
  registry.registerPath({
    method: 'get',
    path: '/v1/admin/zones',
    tags: ['Admin Zones'],
    summary: 'List and search zones with pagination and filters',
    security: bearerAuth,
    request: {
      query: listZonesQuerySchema,
    },
    responses: {
      200: {
        description: 'Paginated list of zones',
        content: {
          'application/json': {
            schema: successResponse(
              z.object({
                zones: z.array(zoneDtoSchema),
                total: z.number(),
                page: z.number(),
                limit: z.number(),
              }),
            ),
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: errorResponse } },
      },
      403: {
        description: 'Forbidden',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  // Admin create zone
  registry.registerPath({
    method: 'post',
    path: '/v1/admin/zones',
    tags: ['Admin Zones'],
    summary: 'Create a new geographic zone',
    security: bearerAuth,
    request: {
      body: {
        content: {
          'application/json': {
            schema: createZoneSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Zone created successfully',
        content: {
          'application/json': {
            schema: successResponse(zoneDtoSchema),
          },
        },
      },
      400: {
        description: 'Validation or topological rule violation',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  // Admin validate zone (dry run)
  registry.registerPath({
    method: 'post',
    path: '/v1/admin/zones/validate',
    tags: ['Admin Zones'],
    summary: 'Validate zone geometry without database persistence',
    security: bearerAuth,
    request: {
      body: {
        content: {
          'application/json': {
            schema: validateZoneSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Validation results with violations list',
        content: {
          'application/json': {
            schema: successResponse(
              z.object({
                valid: z.boolean(),
                violations: z.array(
                  z.object({
                    code: z.string(),
                    message: z.string(),
                    severity: z.enum(['ERROR', 'WARNING']),
                  }),
                ),
              }),
            ),
          },
        },
      },
    },
  });

  // Admin get zone by ID
  registry.registerPath({
    method: 'get',
    path: '/v1/admin/zones/{id}',
    tags: ['Admin Zones'],
    summary: 'Get zone details by ID',
    security: bearerAuth,
    request: {
      params: zoneIdParamSchema,
    },
    responses: {
      200: {
        description: 'Zone details',
        content: {
          'application/json': {
            schema: successResponse(zoneDtoSchema),
          },
        },
      },
      404: {
        description: 'Zone not found',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  // Admin update zone metadata
  registry.registerPath({
    method: 'patch',
    path: '/v1/admin/zones/{id}',
    tags: ['Admin Zones'],
    summary: 'Update non-geometry zone metadata',
    security: bearerAuth,
    request: {
      params: zoneIdParamSchema,
      body: {
        content: {
          'application/json': {
            schema: updateZoneSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Zone updated',
        content: {
          'application/json': {
            schema: successResponse(zoneDtoSchema),
          },
        },
      },
    },
  });

  // Admin update zone geometry with versioning
  registry.registerPath({
    method: 'patch',
    path: '/v1/admin/zones/{id}/geometry',
    tags: ['Admin Zones'],
    summary: 'Update zone geometry creating a new immutable version',
    security: bearerAuth,
    request: {
      params: zoneIdParamSchema,
      body: {
        content: {
          'application/json': {
            schema: updateZoneGeometrySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'New zone version created',
        content: {
          'application/json': {
            schema: successResponse(zoneDtoSchema),
          },
        },
      },
      409: {
        description: 'Optimistic concurrency version conflict',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  // Admin activate zone
  registry.registerPath({
    method: 'post',
    path: '/v1/admin/zones/{id}/activate',
    tags: ['Admin Zones'],
    summary: 'Activate a zone',
    security: bearerAuth,
    request: {
      params: zoneIdParamSchema,
    },
    responses: {
      200: {
        description: 'Zone activated',
        content: { 'application/json': { schema: successResponse(zoneDtoSchema) } },
      },
    },
  });

  // Admin deactivate zone
  registry.registerPath({
    method: 'post',
    path: '/v1/admin/zones/{id}/deactivate',
    tags: ['Admin Zones'],
    summary: 'Deactivate a zone',
    security: bearerAuth,
    request: {
      params: zoneIdParamSchema,
      body: {
        content: {
          'application/json': {
            schema: deactivateZoneSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Zone deactivated',
        content: { 'application/json': { schema: successResponse(zoneDtoSchema) } },
      },
    },
  });

  // Admin get zone history
  registry.registerPath({
    method: 'get',
    path: '/v1/admin/zones/{id}/history',
    tags: ['Admin Zones'],
    summary: 'Get zone version history and audit log trail',
    security: bearerAuth,
    request: {
      params: zoneIdParamSchema,
    },
    responses: {
      200: {
        description: 'Zone version history and audit trail',
        content: {
          'application/json': {
            schema: successResponse(
              z.object({
                versions: z.array(zoneDtoSchema),
                auditLogs: z.array(
                  z.object({
                    id: z.string().uuid(),
                    zoneId: z.string().uuid(),
                    action: z.string(),
                    version: z.number(),
                    changedBy: z.string(),
                    reason: z.string().optional(),
                    createdAt: z.string().datetime(),
                  }),
                ),
              }),
            ),
          },
        },
      },
    },
  });
}
