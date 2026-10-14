import { z } from 'zod';
import {
  registry,
  successResponse,
  errorResponse,
  bearerAuth,
} from '../../../shared/http/swagger.util.js';
import {
  createRideRequestSchema,
  startRideRequestSchema,
  cancelRideSchema,
  listRidesQuerySchema,
  rideIdParamSchema,
  paymentDisputeSchema,
  paymentDisputeResolutionSchema,
} from './rides.validation.js';

export const rideViewSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  bookerRiderId: z.string().uuid(),
  driverId: z.string().uuid().nullable(),
  vehicleId: z.string().uuid().nullable(),
  vehicleCategory: z.string(),
  pickup: z.object({ lat: z.number(), lng: z.number(), address: z.string().nullable() }),
  drop: z.object({ lat: z.number(), lng: z.number(), address: z.string().nullable() }),
  passenger: z.object({
    riderId: z.string().uuid().nullable(),
    name: z.string(),
    phoneE164: z.string(),
    pickupOtpExpiresAt: z.string().nullable().optional(),
  }),
  routeSnapshot: z.object({
    provider: z.string(),
    distanceM: z.number().int(),
    durationSeconds: z.number().int(),
    polyline: z.string(),
    calculatedAt: z.string(),
  }),
  zoneSnapshot: z.object({
    classification: z.string(),
    cityZoneId: z.string().uuid().nullable(),
    routeScope: z.string().nullable().optional(),
    destinationStateCode: z.string().nullable().optional(),
  }),
  pricingSnapshot: z.any(),
  suggestedFarePaise: z.number().int(),
  proposedFarePaise: z.number().int().nullable(),
  agreedFarePaise: z.number().int().nullable(),
  cancellationReason: z.string().nullable(),
  offeringExpiresAt: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  arrivedAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  settledAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  version: z.number().int(),
  pickupOtp: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export function registerRidesSwaggerPaths(): void {
  registry.registerPath({
    method: 'post',
    path: '/v1/rides',
    tags: ['Rides'],
    summary: 'Request a new ride with a valid quote token',
    security: bearerAuth,
    request: {
      body: {
        content: {
          'application/json': {
            schema: createRideRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Ride requested successfully',
        content: { 'application/json': { schema: successResponse(rideViewSchema) } },
      },
      400: {
        description: 'Validation failed or invalid quote',
        content: { 'application/json': { schema: errorResponse } },
      },
      401: {
        description: 'Authentication required',
        content: { 'application/json': { schema: errorResponse } },
      },
      403: {
        description: 'Rider profile required',
        content: { 'application/json': { schema: errorResponse } },
      },
      409: {
        description: 'Quote expired or pricing version mismatch',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/v1/rides',
    tags: ['Rides'],
    summary: 'List rides accessible to the current user (rider, driver, or admin)',
    security: bearerAuth,
    request: {
      query: listRidesQuerySchema,
    },
    responses: {
      200: {
        description: 'Rides retrieved successfully',
        content: { 'application/json': { schema: successResponse(z.array(rideViewSchema)) } },
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
    path: '/v1/rides/{id}',
    tags: ['Rides'],
    summary: 'Get details of a ride by ID',
    security: bearerAuth,
    request: {
      params: rideIdParamSchema,
    },
    responses: {
      200: {
        description: 'Ride retrieved successfully',
        content: { 'application/json': { schema: successResponse(rideViewSchema) } },
      },
      401: {
        description: 'Authentication required',
        content: { 'application/json': { schema: errorResponse } },
      },
      404: {
        description: 'Ride not found',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/v1/rides/{id}/cancel',
    tags: ['Rides'],
    summary: 'Cancel an active ride',
    security: bearerAuth,
    request: {
      params: rideIdParamSchema,
      body: {
        content: {
          'application/json': {
            schema: cancelRideSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Ride cancelled',
        content: {
          'application/json': {
            schema: successResponse(
              z.object({
                ride: rideViewSchema,
                feeBreakdown: z.any().optional(),
              }),
            ),
          },
        },
      },
      400: {
        description: 'Cannot cancel in current state',
        content: { 'application/json': { schema: errorResponse } },
      },
      401: {
        description: 'Authentication required',
        content: { 'application/json': { schema: errorResponse } },
      },
      403: {
        description: 'Forbidden',
        content: { 'application/json': { schema: errorResponse } },
      },
      404: {
        description: 'Ride not found',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/v1/rides/{id}/accept',
    tags: ['Rides'],
    summary: 'Accept an unassigned ride offer (Driver only)',
    security: bearerAuth,
    request: {
      params: rideIdParamSchema,
    },
    responses: {
      200: {
        description: 'Ride accepted successfully',
        content: { 'application/json': { schema: successResponse(rideViewSchema) } },
      },
      401: {
        description: 'Authentication required',
        content: { 'application/json': { schema: errorResponse } },
      },
      403: {
        description: 'Driver profile required',
        content: { 'application/json': { schema: errorResponse } },
      },
      404: {
        description: 'Ride not found',
        content: { 'application/json': { schema: errorResponse } },
      },
      409: {
        description: 'Ride already assigned or completed',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/v1/rides/{id}/en-route',
    tags: ['Rides'],
    summary: 'Mark driver en route to pickup (Driver only)',
    security: bearerAuth,
    request: {
      params: rideIdParamSchema,
    },
    responses: {
      200: {
        description: 'Driver is en route',
        content: { 'application/json': { schema: successResponse(rideViewSchema) } },
      },
      401: {
        description: 'Authentication required',
        content: { 'application/json': { schema: errorResponse } },
      },
      403: {
        description: 'Driver profile required',
        content: { 'application/json': { schema: errorResponse } },
      },
      404: {
        description: 'Ride not found',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/v1/rides/{id}/arrived',
    tags: ['Rides'],
    summary: 'Mark driver arrived at pickup location (Driver only)',
    security: bearerAuth,
    request: {
      params: rideIdParamSchema,
    },
    responses: {
      200: {
        description: 'Driver has arrived',
        content: { 'application/json': { schema: successResponse(rideViewSchema) } },
      },
      401: {
        description: 'Authentication required',
        content: { 'application/json': { schema: errorResponse } },
      },
      403: {
        description: 'Driver profile required',
        content: { 'application/json': { schema: errorResponse } },
      },
      404: {
        description: 'Ride not found',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/v1/rides/{id}/start',
    tags: ['Rides'],
    summary: 'Start the trip with rider pickup OTP (Driver only)',
    security: bearerAuth,
    request: {
      params: rideIdParamSchema,
      body: {
        content: {
          'application/json': {
            schema: startRideRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Trip started',
        content: { 'application/json': { schema: successResponse(rideViewSchema) } },
      },
      400: {
        description: 'Invalid OTP or state',
        content: { 'application/json': { schema: errorResponse } },
      },
      401: {
        description: 'Authentication required',
        content: { 'application/json': { schema: errorResponse } },
      },
      403: {
        description: 'Driver profile required',
        content: { 'application/json': { schema: errorResponse } },
      },
      404: {
        description: 'Ride not found',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  for (const operation of ['complete', 'payment/confirm']) {
    registry.registerPath({
      method: 'post',
      path: `/v1/rides/{id}/${operation}`,
      tags: ['Rides'],
      summary:
        operation === 'complete'
          ? 'Complete trip; await payment receipt (Driver only)'
          : 'Confirm payment received and settle commission (Driver only)',
      security: bearerAuth,
      request: {
        params: rideIdParamSchema,
      },
      responses: {
        200: {
          description: 'Trip completed',
          content: {
            'application/json': {
              schema: successResponse(
                z.object({
                  ride: rideViewSchema,
                  farePaise: z.number().int(),
                  commissionPaise: z.number().int(),
                  walletBalancePaise: z.number().int(),
                }),
              ),
            },
          },
        },
        400: {
          description: 'Cannot complete in current state',
          content: { 'application/json': { schema: errorResponse } },
        },
        401: {
          description: 'Authentication required',
          content: { 'application/json': { schema: errorResponse } },
        },
        403: {
          description: 'Driver profile required',
          content: { 'application/json': { schema: errorResponse } },
        },
        404: {
          description: 'Ride not found',
          content: { 'application/json': { schema: errorResponse } },
        },
      },
    });
  }

  registry.registerPath({
    method: 'post',
    path: '/v1/rides/{id}/payment/dispute',
    tags: ['Rides'],
    summary: 'Rider disputes confirmed payment',
    security: bearerAuth,
    request: {
      params: rideIdParamSchema,
      body: { content: { 'application/json': { schema: paymentDisputeSchema } } },
    },
    responses: {
      200: {
        description: 'Dispute filed',
        content: { 'application/json': { schema: successResponse(rideViewSchema) } },
      },
      403: {
        description: 'Only the booker or passenger rider can dispute',
        content: { 'application/json': { schema: errorResponse } },
      },
      409: {
        description: 'Payment already disputed',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/rides/{id}/payment/dispute/resolve',
    tags: ['Rides'],
    summary: 'Support or super admin resolves payment dispute',
    security: bearerAuth,
    request: {
      params: rideIdParamSchema,
      body: { content: { 'application/json': { schema: paymentDisputeResolutionSchema } } },
    },
    responses: {
      200: {
        description: 'Dispute resolved and rider-win commission refund posted once',
        content: { 'application/json': { schema: successResponse(rideViewSchema) } },
      },
      403: {
        description: 'Admin role required',
        content: { 'application/json': { schema: errorResponse } },
      },
      409: {
        description: 'Dispute or wallet state changed',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/v1/rides/payment/disputes',
    tags: ['Rides'],
    summary: 'List open payment disputes for support or super admin',
    security: bearerAuth,
    responses: {
      200: {
        description: 'Open disputes',
        content: {
          'application/json': {
            schema: successResponse(z.array(z.object({ ride: rideViewSchema, ticket: z.any() }))),
          },
        },
      },
      403: {
        description: 'Admin role required',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });
}
