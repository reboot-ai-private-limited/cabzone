import { z } from 'zod';
import { VEHICLE_CATEGORIES } from '@cabzone/contracts';
import { allowDevShortcuts } from '../../../config/env.js';
import {
  registry,
  bearerAuth,
  successResponse,
  errorResponse,
} from '../../../shared/http/swagger.util.js';
import {
  pushTokenSchema,
  removePushTokenSchema,
  setStatusSchema,
  updateLocationSchema,
} from './dispatch.controller.js';
import { listFleetQuerySchema, simulateFleetBodySchema } from './adminDispatch.controller.js';

const fleetDriverSchema = z.object({
  driverId: z.string(),
  userId: z.string(),
  vehicleCategory: z.enum(VEHICLE_CATEGORIES),
  lat: z.number(),
  lng: z.number(),
  heading: z.number().nullable(),
  speedMps: z.number().nullable(),
  status: z.enum(['ONLINE', 'BUSY']),
  activeRideId: z.string().nullable(),
  locationUpdatedAt: z.string(),
  driverName: z.string().optional(),
  phoneE164: z.string().optional(),
  vehicleRegistration: z.string().optional(),
});

let registered = false;
let sharedPushRegistered = false;

export function registerPushTokenSwaggerPaths(): void {
  if (sharedPushRegistered) return;
  sharedPushRegistered = true;

  registry.registerPath({
    method: 'post',
    path: '/v1/push-token',
    tags: ['Push Notifications'],
    summary: 'Register Expo push token for rider or driver background ride alerts',
    security: bearerAuth,
    request: { body: { content: { 'application/json': { schema: pushTokenSchema } } } },
    responses: {
      200: {
        description: 'Push token registered',
        content: { 'application/json': { schema: successResponse(z.object({ ok: z.boolean() })) } },
      },
      400: { description: 'Invalid Expo push token', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/v1/push-token',
    tags: ['Push Notifications'],
    summary: 'Unregister Expo push token for authenticated installation',
    security: bearerAuth,
    request: { body: { content: { 'application/json': { schema: removePushTokenSchema } } } },
    responses: {
      200: {
        description: 'Push token removed',
        content: { 'application/json': { schema: successResponse(z.object({ ok: z.boolean() })) } },
      },
    },
  });
}

export function registerDispatchSwaggerPaths(): void {
  if (registered) return;
  registered = true;

  registry.registerPath({
    method: 'post',
    path: '/v1/driver/status',
    tags: ['Driver Dispatch'],
    summary: 'Set driver availability status (ONLINE / OFFLINE)',
    security: bearerAuth,
    request: { body: { content: { 'application/json': { schema: setStatusSchema } } } },
    responses: {
      200: {
        description: 'Driver availability updated',
        content: {
          'application/json': {
            schema: successResponse(z.object({ status: z.enum(['ONLINE', 'OFFLINE']) })),
          },
        },
      },
      400: { description: 'Location required or ineligible', content: { 'application/json': { schema: errorResponse } } },
      403: { description: 'Driver role required', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/v1/driver/status',
    tags: ['Driver Dispatch'],
    summary: 'Get current server-owned driver availability status',
    security: bearerAuth,
    responses: {
      200: {
        description: 'Current availability state',
        content: {
          'application/json': {
            schema: successResponse(z.object({ status: z.enum(['ONLINE', 'OFFLINE']) })),
          },
        },
      },
      403: { description: 'Driver role required', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/v1/driver/location',
    tags: ['Driver Dispatch'],
    summary: 'Report live driver GPS telemetry while ONLINE',
    security: bearerAuth,
    request: { body: { content: { 'application/json': { schema: updateLocationSchema } } } },
    responses: {
      200: {
        description: 'Location heartbeat recorded',
        content: { 'application/json': { schema: successResponse(z.object({ ok: z.boolean() })) } },
      },
      400: { description: 'Invalid coordinates or offline', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/v1/driver/offers',
    tags: ['Driver Dispatch'],
    summary: 'List active nearby ride offers eligible for the online driver',
    security: bearerAuth,
    responses: {
      200: {
        description: 'Eligible ride offers ordered by distance',
        content: { 'application/json': { schema: successResponse(z.array(z.any())) } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/v1/driver/push-token',
    tags: ['Driver Dispatch'],
    summary: 'Register Expo push token for background ride offer alerts',
    security: bearerAuth,
    request: { body: { content: { 'application/json': { schema: pushTokenSchema } } } },
    responses: {
      200: {
        description: 'Push token registered',
        content: { 'application/json': { schema: successResponse(z.object({ ok: z.boolean() })) } },
      },
      400: { description: 'Invalid Expo push token', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/v1/driver/push-token',
    tags: ['Driver Dispatch'],
    summary: 'Unregister Expo push token for device installation',
    security: bearerAuth,
    request: { body: { content: { 'application/json': { schema: removePushTokenSchema } } } },
    responses: {
      200: {
        description: 'Push token removed',
        content: { 'application/json': { schema: successResponse(z.object({ ok: z.boolean() })) } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/v1/admin/dispatch/fleet',
    tags: ['Admin Dispatch'],
    summary: 'Inspect live online and busy fleet drivers (scoped to assigned cities for CITY_ADMIN)',
    security: bearerAuth,
    request: { query: listFleetQuerySchema },
    responses: {
      200: {
        description: 'Live fleet drivers',
        content: { 'application/json': { schema: successResponse(z.array(fleetDriverSchema)) } },
      },
      403: { description: 'Admin dispatch role required', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  if (allowDevShortcuts) {
    registry.registerPath({
      method: 'post',
      path: '/v1/admin/dispatch/simulate-fleet',
      tags: ['Admin Dispatch'],
      summary: 'Seed or clear simulated fleet drivers in development environments',
      security: bearerAuth,
      request: { body: { content: { 'application/json': { schema: simulateFleetBodySchema } } } },
      responses: {
        200: {
          description: 'Simulation state updated',
          content: {
            'application/json': {
              schema: successResponse(z.object({ simulated: z.boolean(), count: z.number().int() })),
            },
          },
        },
        403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponse } } },
      },
    });
  }
}
