import { z } from 'zod';
import {
  PRICING_CONFIG_LEVELS,
  PRICING_CONFIG_STATUSES,
  VEHICLE_CATEGORIES,
} from '@cabzone/contracts';
import {
  registry,
  bearerAuth,
  successResponse,
  errorResponse,
} from '../../../shared/http/swagger.util.js';
import {
  createPricingConfigSchema,
  listPricingConfigsSchema,
  updatePricingConfigSchema,
} from './pricing.validation.js';

const configIdParamSchema = z.object({
  id: z.string(),
});

const pricingConfigDtoSchema = z.object({
  id: z.string(),
  level: z.enum(PRICING_CONFIG_LEVELS),
  cityZoneId: z.string().nullable(),
  stateCode: z.string().nullable(),
  vehicleType: z.enum(VEHICLE_CATEGORIES),
  baseFarePaise: z.number().int(),
  ratePerKmPaise: z.number().int(),
  minimumFarePaise: z.number().int(),
  outstationBaseFarePaise: z.number().int().optional(),
  outstationRatePerKmPaise: z.number().int().optional(),
  outstationMinimumFarePaise: z.number().int().optional(),
  bufferSurchargePaise: z.number().int(),
  negotiationFloorPercent: z.number(),
  negotiationCeilingPercent: z.number(),
  negotiationWindowSeconds: z.number().int(),
  commissionPercent: z.number(),
  status: z.enum(PRICING_CONFIG_STATUSES),
  version: z.number().int(),
});

const createQuoteRequestSchema = z.object({
  pickup: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  drop: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  stops: z
    .array(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }))
    .max(3)
    .optional(),
  vehicleCategory: z.enum(VEHICLE_CATEGORIES).optional(),
  distanceM: z.number().positive().optional(),
  durationSeconds: z.number().positive().optional(),
});

let registered = false;

export function registerPricingSwaggerPaths(): void {
  if (registered) return;
  registered = true;

  registry.registerPath({
    method: 'post',
    path: '/v1/pricing/quotes',
    tags: ['Pricing'],
    summary: 'Compute fare quotes and signed quote tokens for pickup and drop coordinates',
    request: {
      body: { content: { 'application/json': { schema: createQuoteRequestSchema } } },
    },
    responses: {
      200: {
        description: 'Fare quote and signed quoteToken',
        content: { 'application/json': { schema: successResponse(z.any()) } },
      },
      400: {
        description: 'Invalid coordinates or unsupported area',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/v1/admin/pricing/configs',
    tags: ['Admin Pricing'],
    summary: 'List pricing configurations (scoped to assigned cities for CITY_ADMIN)',
    security: bearerAuth,
    request: { query: listPricingConfigsSchema },
    responses: {
      200: {
        description: 'Pricing configurations',
        content: {
          'application/json': { schema: successResponse(z.array(pricingConfigDtoSchema)) },
        },
      },
      401: { description: 'Unauthorized', content: { 'application/json': { schema: errorResponse } } },
      403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/v1/admin/pricing/configs',
    tags: ['Admin Pricing'],
    summary: 'Create a pricing configuration (CITY_ADMIN restricted to assigned CITY level)',
    security: bearerAuth,
    request: {
      body: { content: { 'application/json': { schema: createPricingConfigSchema } } },
    },
    responses: {
      201: {
        description: 'Pricing configuration created',
        content: { 'application/json': { schema: successResponse(pricingConfigDtoSchema) } },
      },
      400: { description: 'Validation failed', content: { 'application/json': { schema: errorResponse } } },
      403: { description: 'City scope denied', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/v1/admin/pricing/configs/{id}',
    tags: ['Admin Pricing'],
    summary: 'Update a pricing configuration',
    security: bearerAuth,
    request: {
      params: configIdParamSchema,
      body: { content: { 'application/json': { schema: updatePricingConfigSchema } } },
    },
    responses: {
      200: {
        description: 'Pricing configuration updated',
        content: { 'application/json': { schema: successResponse(pricingConfigDtoSchema) } },
      },
      403: { description: 'City scope denied', content: { 'application/json': { schema: errorResponse } } },
      404: { description: 'Config not found', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/v1/admin/pricing/configs/{id}',
    tags: ['Admin Pricing'],
    summary: 'Delete a non-active pricing configuration',
    security: bearerAuth,
    request: { params: configIdParamSchema },
    responses: {
      200: {
        description: 'Pricing configuration deleted',
        content: {
          'application/json': { schema: successResponse(z.object({ id: z.string() })) },
        },
      },
      403: { description: 'City scope denied', content: { 'application/json': { schema: errorResponse } } },
      404: { description: 'Config not found', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/v1/admin/pricing/configs/{id}/activate',
    tags: ['Admin Pricing'],
    summary: 'Activate a pricing configuration and supersede prior active config in scope',
    security: bearerAuth,
    request: { params: configIdParamSchema },
    responses: {
      200: {
        description: 'Pricing configuration activated',
        content: { 'application/json': { schema: successResponse(pricingConfigDtoSchema) } },
      },
      403: { description: 'City scope denied', content: { 'application/json': { schema: errorResponse } } },
      404: { description: 'Config not found', content: { 'application/json': { schema: errorResponse } } },
    },
  });
}
