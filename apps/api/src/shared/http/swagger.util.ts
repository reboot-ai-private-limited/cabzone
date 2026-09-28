import {
  OpenApiGeneratorV3,
  OpenAPIRegistry,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// CRITICAL: Patch Zod before any schemas or routes are imported
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// Register Bearer Auth Security Scheme
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

export const bearerAuth = [{ bearerAuth: [] }];

// Metadata schema attached to every response
const requestMetaSchema = z.object({
  method: z.string(),
  url: z.string(),
  requestId: z.string(),
  ip: z.string().optional(),
});

// Standard Success Envelope: { success: true, statusCode, message, data, request }
export function successResponse<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    statusCode: z.number(),
    request: requestMetaSchema,
    message: z.string(),
    data: dataSchema,
  });
}

// Standard Error Envelope: { success: false, statusCode, code, message, data?, request }
export const errorResponse = z.object({
  success: z.literal(false),
  statusCode: z.number(),
  code: z.string(),
  request: requestMetaSchema,
  message: z.string(),
  data: z.unknown().optional(),
});

export function generateOpenApiDocument(
  serviceTitle = 'Cabzon API Documentation',
  serviceVersion = '1.0.0',
) {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: serviceTitle,
      version: serviceVersion,
      description: 'Programmatically generated from runtime Zod request validation schemas with zero drift.',
    },
    servers: [{ url: '/api', description: 'Current environment server' }],
  });
}
