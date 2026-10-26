import { z } from 'zod';
import {
  bearerAuth,
  errorResponse,
  registry,
  successResponse,
} from '@/shared/http/swagger.util.js';
import { pushTokenSchema, removePushTokenSchema } from './dispatch.controller.js';

const okResponse = successResponse(z.object({ ok: z.literal(true) }));

export function registerPushTokenSwaggerPaths(): void {
  for (const [method, schema] of [
    ['post', pushTokenSchema],
    ['delete', removePushTokenSchema],
  ] as const) {
    registry.registerPath({
      method,
      path: '/v1/push-token',
      tags: ['Push notifications'],
      summary: method === 'post' ? 'Register a device push token' : 'Remove a device push token',
      security: bearerAuth,
      request: { body: { content: { 'application/json': { schema } } } },
      responses: {
        200: {
          description: method === 'post' ? 'Push token registered' : 'Push token removed',
          content: { 'application/json': { schema: okResponse } },
        },
        400: {
          description: 'Invalid token or installation ID',
          content: { 'application/json': { schema: errorResponse } },
        },
        401: {
          description: 'Authentication required',
          content: { 'application/json': { schema: errorResponse } },
        },
      },
    });
  }
}
