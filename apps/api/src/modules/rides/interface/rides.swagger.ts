import { z } from 'zod';
import {
  extensionRequestSchema,
  extensionResponseSchema,
  extensionParamsSchema,
} from './rideExtensions.controller.js';
import { DRIVER_EARNINGS_PERIODS } from '@cabzone/contracts';
import { chatSendSchema, chatQuerySchema } from './rideChat.controller.js';
import { callStartSchema, callInstallationSchema } from './rideCalls.controller.js';
import {
  registry,
  successResponse,
  errorResponse,
  bearerAuth,
} from '../../../shared/http/swagger.util.js';
import {
  createRideHeadersSchema,
  createRideRequestSchema,
  startRideRequestSchema,
  cancelRideSchema,
  counterResponseSchema,
  driverCounterSchema,
  listPaymentDisputesQuerySchema,
  listRidesQuerySchema,
  rideIdParamSchema,
  paymentDisputeSchema,
  markRideUnpaidSchema,
  paymentDisputeResolutionSchema,
  proposeFareSchema,
  submitRideRatingSchema,
  upiPaymentProofSchema,
  waiveCancellationFeeSchema,
  driverEarningsQuerySchema,
  driverHistoryQuerySchema,
  reconcileDriverEarningsSchema,
} from './rides.validation.js';

export const driverSettlementSchema = z.object({
  grossPaise: z.number().int(),
  commissionChargedPaise: z.number().int(),
  commissionRefundedPaise: z.number().int(),
  netCommissionPaise: z.number().int(),
  netEarningsPaise: z.number().int(),
  onlineEarningsReversedPaise: z.number().int().optional(),
  settledVia: z.enum(['CASH', 'ONLINE_UPI', 'UNSETTLED']),
});

export const rideViewSchema = z.object({
  extensionProposal: z
    .object({
      id: z.string().uuid(),
      requestId: z.string(),
      originalDrop: z.object({ lat: z.number(), lng: z.number(), address: z.string().nullable() }),
      newDrop: z.object({ lat: z.number(), lng: z.number(), address: z.string().nullable() }),
      additionalDistanceM: z.number().int().positive(),
      additionalFarePaise: z.number().int().nonnegative(),
      status: z.enum(['REQUESTED', 'ACCEPTED', 'REJECTED']),
      requestedAt: z.string().datetime(),
      expiresAt: z.string().datetime(),
      respondedAt: z.string().datetime().nullable(),
      baselineRideVersion: z.number().int(),
      route: z.object({
        provider: z.string(),
        distanceM: z.number().int(),
        durationSeconds: z.number().int(),
        polyline: z.string(),
      }),
      zone: z.object({
        classification: z.enum(['IN_CITY', 'OUTSTATION', 'INTERSTATE']),
        cityZoneId: z.string().nullable(),
        destinationStateCode: z.string().nullable(),
        routeScope: z.enum(['INTRA_STATE', 'INTERSTATE']).nullable(),
      }),
    })
    .nullish(),
  tollSnapshot: z
    .object({
      exists: z.boolean().nullable(),
      estimatedAmountPaise: z.number().int().nonnegative().nullable(),
      currency: z.literal('INR'),
      provider: z.string(),
      isEstimate: z.literal(true),
      commercialVehicleCaveat: z.literal(true),
      permitsMayApply: z.boolean(),
    })
    .nullish(),
  paymentCollection: z.enum(['DIRECT', 'CASH', 'RAZORPAY_TEST', 'RAZORPAY_UPI']).optional(),
  id: z.string().uuid(),
  status: z.string(),
  bookerRiderId: z.string().uuid(),
  driverId: z.string().uuid().nullable(),
  vehicleId: z.string().uuid().nullable(),
  assignedDriver: z
    .object({
      driverId: z.string(),
      name: z.string(),
      profilePhotoUrl: z.string().nullable(),
      vehicle: z
        .object({
          vehicleId: z.string(),
          make: z.string(),
          model: z.string(),
          color: z.string(),
          registrationNumber: z.string(),
          vehicleCategory: z.string(),
        })
        .nullable(),
    })
    .nullable()
    .optional(),
  vehicleCategory: z.string(),
  pickup: z.object({ lat: z.number(), lng: z.number(), address: z.string().nullable() }),
  drop: z.object({ lat: z.number(), lng: z.number(), address: z.string().nullable() }),
  passenger: z.object({
    riderId: z.string().uuid().nullable(),
    name: z.string(),
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
  arrearsPaise: z.number().int(),
  totalPayablePaise: z.number().int().nullable(),
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
  driverSettlement: driverSettlementSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const driverEarningsSummarySchema = z.object({
  period: z.enum(DRIVER_EARNINGS_PERIODS),
  timezone: z.literal('Asia/Kolkata'),
  periodStart: z.string().nullable(),
  periodEnd: z.string(),
  totalAssignedRidesCount: z.number().int(),
  completedTripsCount: z.number().int(),
  cancelledTripsCount: z.number().int(),
  pendingPaymentTripsCount: z.number().int(),
  pendingPaymentGrossPaise: z.number().int(),
  disputedTripsCount: z.number().int(),
  disputedGrossPaise: z.number().int(),
  grossFarePaise: z.number().int(),
  cashGrossPaise: z.number().int(),
  onlineGrossPaise: z.number().int(),
  commissionChargedPaise: z.number().int(),
  commissionRefundedPaise: z.number().int(),
  netCommissionPaise: z.number().int(),
  netEarningsPaise: z.number().int(),
  onlineEarningsReversedPaise: z.number().int().optional(),
  cancellationCompensationPaise: z.number().int(),
  unreconciledRidesCount: z.number().int(),
});

const paginatedRidesSchema = z.object({
  items: z.array(rideViewSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
  hasMore: z.boolean(),
});

const driverEarningsReconciliationSchema = z.object({
  mode: z.enum(['AUDIT', 'BACKFILL_ONLINE_EARNINGS', 'RECONCILE_PENDING_ONLINE']),
  checkedSettledRides: z.number().int(),
  cleanCashRides: z.number().int(),
  cleanOnlineRides: z.number().int(),
  backfilledRideIds: z.array(z.string().uuid()),
  skippedRideIds: z.array(z.string().uuid()),
  checkedPendingOnlineRides: z.number().int().optional(),
  reconciledPendingRideIds: z.array(z.string().uuid()).optional(),
  issues: z.array(
    z.object({
      code: z.enum([
        'HISTORICAL_ONLINE_MISSING_EARNINGS',
        'CASH_MISSING_COMMISSION',
        'AMOUNT_MISMATCH',
        'MISSING_DRIVER_WALLET',
        'ORPHAN_LEDGER_RIDE_ENTRY',
        'PROVIDER_CAPTURED_RIDE_UNSETTLED',
        'PROVIDER_SETTLEMENT_MISMATCH',
        'ONLINE_REFUND_MISSING_REVERSAL',
      ]),
      rideId: z.string().nullable(),
      driverId: z.string().nullable(),
      transactionId: z.string().nullable().optional(),
      expectedPaise: z.number().int().nullable().optional(),
      actualPaise: z.number().int().nullable().optional(),
      detail: z.string(),
    }),
  ),
});

let registered = false;

export function registerRidesSwaggerPaths(): void {
  if (registered) return;
  registered = true;
  const callSchema = z.object({
    id: z.string().uuid(), rideId: z.string().uuid(),
    state: z.enum(['RINGING', 'ACCEPTED', 'CONNECTED', 'ENDED', 'DECLINED', 'MISSED', 'CANCELLED', 'FAILED']),
    callerRole: z.enum(['RIDER', 'DRIVER']), createdAt: z.string().datetime(),
    ringingUntil: z.string().datetime(), joinUntil: z.string().datetime().nullable(),
    connectedAt: z.string().datetime().nullable().optional(),
  });
  const tokenSchema = z.object({ url: z.string().url(), token: z.string(), expiresAt: z.string().datetime() });
  const callActions = [
    { method: 'get', path: '/v1/rides/{id}/calls/current', request: { params: rideIdParamSchema }, response: z.object({ call: callSchema.nullable() }), summary: 'Get the active private ride call' },
    { method: 'post', path: '/v1/rides/{id}/calls', request: { params: rideIdParamSchema, body: { content: { 'application/json': { schema: callStartSchema } } } }, response: callSchema, summary: 'Start a private ride call (3 attempts/minute)' },
    { method: 'post', path: '/v1/rides/{id}/calls/{callId}/answer', request: { params: rideIdParamSchema.extend({ callId: z.string().uuid() }), body: { content: { 'application/json': { schema: callInstallationSchema } } } }, response: callSchema, summary: 'Answer an incoming ride call' },
    { method: 'post', path: '/v1/rides/{id}/calls/{callId}/decline', request: { params: rideIdParamSchema.extend({ callId: z.string().uuid() }) }, response: callSchema, summary: 'Decline an incoming ride call' },
    { method: 'post', path: '/v1/rides/{id}/calls/{callId}/end', request: { params: rideIdParamSchema.extend({ callId: z.string().uuid() }) }, response: callSchema, summary: 'End or cancel a ride call' },
    { method: 'post', path: '/v1/rides/{id}/calls/{callId}/token', request: { params: rideIdParamSchema.extend({ callId: z.string().uuid() }), body: { content: { 'application/json': { schema: callInstallationSchema } } } }, response: tokenSchema, summary: 'Issue a restricted short-lived LiveKit audio token' },
    { method: 'post', path: '/v1/rides/{id}/calls/{callId}/connected', request: { params: rideIdParamSchema.extend({ callId: z.string().uuid() }) }, response: callSchema, summary: 'Verify both media participants are active in the LiveKit room' },
  ] as const;
  for (const action of callActions) {
    registry.registerPath({
      method: action.method,
      path: action.path,
      tags: ['Rides'],
      security: bearerAuth,
      summary: action.summary,
      request: action.request,
      responses: {
        200: { description: 'Call result', content: { 'application/json': { schema: successResponse(action.response) } } },
        201: { description: 'Call started', content: { 'application/json': { schema: successResponse(action.response) } } },
        401: { description: 'Authentication required', content: { 'application/json': { schema: errorResponse } } },
        403: { description: 'Call installation or account is unavailable', content: { 'application/json': { schema: errorResponse } } },
        404: { description: 'Ride or call unavailable', content: { 'application/json': { schema: errorResponse } } },
        409: { description: 'Call is busy, expired or already answered', content: { 'application/json': { schema: errorResponse } } },
        429: { description: 'Call rate limited; Retry-After is in seconds', content: { 'application/json': { schema: errorResponse } } },
        503: { description: 'Private calling is disabled', content: { 'application/json': { schema: errorResponse } } },
      },
    });
  }
  registry.registerPath({
    method: 'post', path: '/v1/rides/calls/current/end', tags: ['Rides'],
    security: bearerAuth, summary: 'End the authenticated user’s call during logout',
    responses: { 200: { description: 'Active call ended', content: { 'application/json': { schema: successResponse(z.object({ ended: z.boolean() })) } } } },
  });
  registry.registerPath({
    method: 'post', path: '/v1/rides/calls/webhook', tags: ['Rides'],
    summary: 'Receive a signed LiveKit room callback',
    responses: { 200: { description: 'Callback accepted' }, 400: { description: 'Invalid callback signature or body' } },
  });
  const messageSchema = z.object({
    id: z.string(), rideId: z.string(), clientMessageId: z.string(),
    senderRole: z.enum(['RIDER', 'DRIVER']), sequence: z.number().int(),
    text: z.string(), createdAt: z.string(),
  });
  for (const method of ['get', 'post'] as const) {
    registry.registerPath({
      method, path: '/v1/rides/{id}/messages', tags: ['Rides'], security: bearerAuth,
      summary: method === 'get' ? 'Read active-ride chat (bounded history/catch-up)' : 'Send a short private ride message (20 attempts per minute)',
      request: { params: rideIdParamSchema, ...(method === 'get' ? { query: chatQuerySchema }
        : { body: { content: { 'application/json': { schema: chatSendSchema } } } }) },
      responses: {
        [method === 'get' ? 200 : 201]: { description: 'Chat result', content: { 'application/json': {
          schema: successResponse(method === 'get' ? z.object({ messages: z.array(messageSchema), hasMore: z.boolean() }) : messageSchema),
        } } },
        400: { description: 'Invalid text, key or cursor', content: { 'application/json': { schema: errorResponse } } },
        401: { description: 'Authentication required', content: { 'application/json': { schema: errorResponse } } },
        403: { description: 'Account inactive', content: { 'application/json': { schema: errorResponse } } },
        404: { description: 'Ride missing or participant unauthorized', content: { 'application/json': { schema: errorResponse } } },
        409: { description: 'Ride closed or message key conflict', content: { 'application/json': { schema: errorResponse } } },
        429: { description: 'Rate limited; Retry-After is in seconds', content: { 'application/json': { schema: errorResponse } } },
        503: { description: 'Ride chat temporarily disabled', content: { 'application/json': { schema: errorResponse } } },
      },
    });
  }
  registry.registerPath({
    method: 'get',
    path: '/v1/rides/{id}/communication',
    tags: ['Rides'],
    security: bearerAuth,
    summary: 'Check active booker or assigned-driver communication access (no admin bypass)',
    request: { params: rideIdParamSchema },
    responses: {
      200: {
        description: 'Communication policy permits this participant; chat/call availability is separate',
        content: { 'application/json': { schema: successResponse(z.object({
          rideId: z.string().uuid(),
          eligible: z.literal(true),
          participantRole: z.enum(['RIDER', 'DRIVER']),
        })) } },
      },
      401: { description: 'Session missing, revoked or expired', content: { 'application/json': { schema: errorResponse } } },
      403: { description: 'Account inactive', content: { 'application/json': { schema: errorResponse } } },
      404: { description: 'Ride missing or caller is not the booker/assigned driver', content: { 'application/json': { schema: errorResponse } } },
      409: { description: 'COMMUNICATION_CLOSED: ride is not assigned or communication has closed', content: { 'application/json': { schema: errorResponse } } },
    },
  });
  for (const action of ['propose', 'respond'] as const) {
    registry.registerPath({
      method: 'post',
      path:
        action === 'propose'
          ? '/v1/rides/{id}/extensions'
          : '/v1/rides/{id}/extensions/{extensionId}/respond',
      tags: ['Rides'],
      security: bearerAuth,
      summary:
        action === 'propose'
          ? 'Rider proposes an expiring destination extension at frozen tariffs'
          : 'Assigned driver accepts or rejects an extension once',
      request: {
        params: action === 'propose' ? rideIdParamSchema : extensionParamsSchema,
        body: {
          content: {
            'application/json': {
              schema: action === 'propose' ? extensionRequestSchema : extensionResponseSchema,
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Authoritative ride with extension proposal',
          content: { 'application/json': { schema: successResponse(rideViewSchema) } },
        },
        400: {
          description: 'Invalid destination or request',
          content: { 'application/json': { schema: errorResponse } },
        },
        401: {
          description: 'Authentication required',
          content: { 'application/json': { schema: errorResponse } },
        },
        403: {
          description: 'Participant role required',
          content: { 'application/json': { schema: errorResponse } },
        },
        404: {
          description: 'Ride unavailable to this participant',
          content: { 'application/json': { schema: errorResponse } },
        },
        409: {
          description: 'Trip/proposal changed, expired, missing GPS or frozen tariff',
          content: { 'application/json': { schema: errorResponse } },
        },
      },
    });
  }

  const rideReviewSchema = z.object({
    id: z.string().uuid(),
    rideId: z.string().uuid(),
    reviewerRole: z.enum(['RIDER', 'DRIVER']),
    revieweeRole: z.enum(['RIDER', 'DRIVER']),
    stars: z.number().int().min(1).max(5),
    tags: z.array(z.string()),
    comment: z.string().nullable(),
    status: z.enum(['HIDDEN', 'REVEALED']),
    windowExpiresAt: z.string(),
    revealedAt: z.string().nullable(),
    createdAt: z.string(),
  });
  const rideRatingStatusSchema = z.object({
    rideId: z.string().uuid(),
    eligible: z.boolean(),
    canSubmit: z.boolean(),
    windowExpiresAt: z.string().nullable(),
    isWindowExpired: z.boolean(),
    visibilityRule: z.literal('DOUBLE_BLIND_7D'),
    myReview: rideReviewSchema.nullable(),
    counterpartyReview: rideReviewSchema.nullable(),
  });

  registry.registerPath({
    method: 'get',
    path: '/v1/rides/{id}/rating',
    tags: ['Rides'],
    security: bearerAuth,
    summary: 'Get double-blind post-ride rating status for a settled ride',
    request: { params: rideIdParamSchema },
    responses: {
      200: {
        description: 'Ride rating status retrieved successfully',
        content: { 'application/json': { schema: successResponse(rideRatingStatusSchema) } },
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
    path: '/v1/rides/{id}/rating',
    tags: ['Rides'],
    security: bearerAuth,
    summary: 'Submit an immutable 1-5 star post-ride rating within 7 days of settlement',
    request: {
      params: rideIdParamSchema,
      body: { content: { 'application/json': { schema: submitRideRatingSchema } } },
    },
    responses: {
      201: {
        description: 'Ride rating submitted successfully',
        content: { 'application/json': { schema: successResponse(rideRatingStatusSchema) } },
      },
      200: {
        description: 'Idempotent replay of already submitted identical rating',
        content: { 'application/json': { schema: successResponse(rideRatingStatusSchema) } },
      },
      400: {
        description: 'Invalid stars, tags, or comment',
        content: { 'application/json': { schema: errorResponse } },
      },
      403: {
        description: 'Only booking rider or assigned driver can rate',
        content: { 'application/json': { schema: errorResponse } },
      },
      404: {
        description: 'Ride not found',
        content: { 'application/json': { schema: errorResponse } },
      },
      409: {
        description: 'Ride not settled, 7-day window expired, or rating already submitted',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  const qrTicketQuery = z.object({ ticket: z.string() });
  const qrTicketBody = z.object({ ticket: z.string() });
  registry.registerPath({
    method: 'get',
    path: '/v1/rides/payment/upi/checkout',
    tags: ['Rides'],
    summary: 'Render signed QR-ticket hosted UPI checkout page for passenger scan',
    request: { query: qrTicketQuery },
    responses: {
      200: { description: 'HTML checkout page' },
      403: {
        description: 'Invalid or expired QR ticket',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/rides/payment/upi/checkout/session',
    tags: ['Rides'],
    summary: 'Create or resume UPI checkout session from a signed passenger QR ticket',
    request: { body: { content: { 'application/json': { schema: qrTicketBody } } } },
    responses: {
      200: {
        description: 'QR ticket payment session',
        content: { 'application/json': { schema: successResponse(z.any()) } },
      },
      403: {
        description: 'Invalid or expired QR ticket',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/rides/payment/upi/checkout/verify',
    tags: ['Rides'],
    summary: 'Verify Razorpay payment proof submitted from the signed QR checkout page',
    request: {
      body: {
        content: {
          'application/json': { schema: qrTicketBody.merge(upiPaymentProofSchema) },
        },
      },
    },
    responses: {
      200: {
        description: 'Verified payment result',
        content: {
          'application/json': { schema: successResponse(z.object({ paid: z.boolean() })) },
        },
      },
      403: {
        description: 'Invalid or expired QR ticket',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/rides/payment/upi/checkout/status',
    tags: ['Rides'],
    summary: 'Poll ride payment capture status using a signed QR ticket',
    request: { body: { content: { 'application/json': { schema: qrTicketBody } } } },
    responses: {
      200: {
        description: 'Payment status',
        content: {
          'application/json': { schema: successResponse(z.object({ paid: z.boolean() })) },
        },
      },
      403: {
        description: 'Invalid or expired QR ticket',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/rides/{id}/payment/upi/qr',
    tags: ['Rides'],
    security: bearerAuth,
    summary: 'Generate signed driver-side UPI QR code for in-cab passenger scan (Driver only)',
    request: { params: rideIdParamSchema },
    responses: {
      200: {
        description: 'Driver payment QR payload',
        content: { 'application/json': { schema: successResponse(z.any()) } },
      },
      403: {
        description: 'Assigned driver required',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/v1/rides/{id}/payment/upi/driver-status',
    tags: ['Rides'],
    security: bearerAuth,
    summary: 'Poll online payment settlement status for the assigned driver (Driver only)',
    request: { params: rideIdParamSchema },
    responses: {
      200: {
        description: 'Driver payment status',
        content: {
          'application/json': { schema: successResponse(z.object({ paid: z.boolean() })) },
        },
      },
      403: {
        description: 'Assigned driver required',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/v1/rides/{id}/events',
    tags: ['Rides'],
    security: bearerAuth,
    summary: 'Ordered ride event audit trail (scoped to assigned cities for CITY_ADMIN)',
    request: { params: rideIdParamSchema },
    responses: {
      200: {
        description: 'Ordered ride events',
        content: { 'application/json': { schema: successResponse(z.array(z.any())) } },
      },
      403: {
        description: 'City scope denied',
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
    path: '/v1/rides/{id}/counter',
    tags: ['Rides'],
    security: bearerAuth,
    summary: 'Submit a driver fare counter-offer during active negotiation window (Driver only)',
    request: {
      params: rideIdParamSchema,
      body: { content: { 'application/json': { schema: driverCounterSchema } } },
    },
    responses: {
      201: {
        description: 'Counter-offer sent to rider',
        content: { 'application/json': { schema: successResponse(z.any()) } },
      },
      400: {
        description: 'Out of negotiation bounds',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/rides/{id}/counter/respond',
    tags: ['Rides'],
    security: bearerAuth,
    summary: 'Accept or decline a driver fare counter-offer (Rider only)',
    request: {
      params: rideIdParamSchema,
      body: { content: { 'application/json': { schema: counterResponseSchema } } },
    },
    responses: {
      200: {
        description: 'Counter-offer response applied',
        content: { 'application/json': { schema: successResponse(rideViewSchema) } },
      },
      409: {
        description: 'Counter expired or ride already assigned',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/rides/{id}/payment/claim-cash',
    tags: ['Rides'],
    security: bearerAuth,
    summary: 'Rider claims cash was handed to driver; unblocks rider booking while awaiting driver confirmation',
    request: { params: rideIdParamSchema },
    responses: {
      200: {
        description: 'Ride transitioned to PAYMENT_CASH_CLAIMED',
        content: { 'application/json': { schema: successResponse(rideViewSchema) } },
      },
      403: { description: 'Only booking rider or passenger can claim cash' },
      409: { description: 'Previous cash claim still unconfirmed or ride not awaiting payment' },
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/rides/{id}/payment/unpaid',
    tags: ['Rides'],
    security: bearerAuth,
    summary: 'Assigned driver reports passenger left without paying; charges 0 commission and clears driver pending lock',
    request: {
      params: rideIdParamSchema,
      body: { content: { 'application/json': { schema: markRideUnpaidSchema } } },
    },
    responses: {
      200: {
        description: 'Ride marked PAYMENT_UNPAID (or PAYMENT_DISPUTED if cash was claimed)',
        content: { 'application/json': { schema: successResponse(rideViewSchema) } },
      },
      403: { description: 'Only assigned driver can mark ride unpaid' },
      409: { description: 'Ride is not in an unpaid-eligible state' },
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/rides/{id}/payment/cash',
    tags: ['Rides'],
    security: bearerAuth,
    summary: 'Switch an unpaid ride to cash; assigned driver must separately confirm receipt',
    request: { params: rideIdParamSchema },
    responses: {
      200: {
        description: 'Payment method and settlement state',
        content: {
          'application/json': {
            schema: successResponse(
              z.object({
                paid: z.boolean(),
                method: z.enum(['UPI', 'CASH']),
                testMode: z.boolean(),
                requiresReview: z.boolean(),
                cashClaimedByRider: z.boolean().optional(),
                unpaidReportedByDriver: z.boolean().optional(),
              }),
            ),
          },
        },
      },
      403: { description: 'Only booking rider or assigned driver can change payment' },
      409: {
        description:
          'Online payment is processing, cannot be closed, or ride no longer awaits payment',
      },
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/rides/{id}/payment/upi/session',
    tags: ['Rides'],
    summary: 'Reuse the ride UPI QR/intent in live mode or simulated checkout in test mode',
    security: bearerAuth,
    request: { params: rideIdParamSchema },
    responses: {
      200: {
        description: 'Shared payment session',
        content: {
          'application/json': {
            schema: successResponse(
              z.discriminatedUnion('kind', [
                z.object({
                  kind: z.literal('intent'),
                  qrId: z.string(),
                  upiUrl: z.string(),
                  imageDataUrl: z.string(),
                  amountPaise: z.number().int(),
                  expiresAt: z.string().datetime(),
                  testMode: z.literal(false),
                }),
                z.object({
                  kind: z.literal('checkout'),
                  checkout: z.object({
                    keyId: z.string(),
                    orderId: z.string(),
                    amountPaise: z.number().int(),
                    currency: z.literal('INR'),
                    testMode: z.boolean(),
                  }),
                }),
              ]),
            ),
          },
        },
      },
      403: { description: 'Booking customer required' },
      409: { description: 'Expired or changed payment session' },
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/rides/payment/upi/webhook',
    tags: ['Rides'],
    summary:
      'Receive signed Razorpay QR credit notifications; independently reconcile captured payment',
    request: { headers: z.object({ 'x-razorpay-signature': z.string() }) },
    responses: {
      200: { description: 'Notification processed or irrelevant event acknowledged' },
      403: { description: 'Missing or invalid webhook signature' },
    },
  });
  for (const [method, suffix, summary] of [
    ['post', '', 'Create or resume UPI-only Razorpay test checkout for the booking customer'],
    ['post', '/verify', 'Verify checkout proof and reconcile a captured UPI test payment'],
    [
      'get',
      '/status',
      'Recover payment status from Razorpay and settle a captured UPI test payment',
    ],
  ] as const) {
    registry.registerPath({
      method,
      path: `/v1/rides/{id}/payment/upi${suffix}`,
      tags: ['Rides'],
      summary,
      security: bearerAuth,
      request: {
        params: rideIdParamSchema,
        ...(suffix === '/verify'
          ? { body: { content: { 'application/json': { schema: upiPaymentProofSchema } } } }
          : {}),
      },
      responses: {
        200: {
          description: 'UPI test payment result',
          content: {
            'application/json': {
              schema: successResponse(
                suffix === ''
                  ? z.object({
                      keyId: z.string(),
                      orderId: z.string(),
                      amountPaise: z.number().int(),
                      currency: z.literal('INR'),
                      testMode: z.boolean(),
                    })
                  : z.object({ paid: z.boolean() }),
              ),
            },
          },
        },
        400: {
          description: 'Invalid payment proof or unavailable checkout',
          content: { 'application/json': { schema: errorResponse } },
        },
        403: {
          description: 'Booking customer required',
          content: { 'application/json': { schema: errorResponse } },
        },
        409: {
          description: 'Ride payment state changed',
          content: { 'application/json': { schema: errorResponse } },
        },
      },
    });
  }
  registry.registerPath({
    method: 'post',
    path: '/v1/rides/{id}/fare/raise',
    tags: ['Rides'],
    summary:
      'Raise the rider offer during the active search window; clears pending driver counters',
    security: bearerAuth,
    request: {
      params: rideIdParamSchema,
      body: { content: { 'application/json': { schema: proposeFareSchema } } },
    },
    responses: {
      200: {
        description: 'Fare raised',
        content: { 'application/json': { schema: successResponse(rideViewSchema) } },
      },
      400: {
        description: 'Fare is not higher or exceeds the ceiling',
        content: { 'application/json': { schema: errorResponse } },
      },
      409: {
        description: 'Offer window closed or ride changed',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/rides',
    tags: ['Rides'],
    summary: 'Request a new ride with a valid quote token',
    security: bearerAuth,
    request: {
      headers: createRideHeadersSchema,
      body: {
        content: {
          'application/json': {
            schema: createRideRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Idempotent replay of an existing ride request',
        content: { 'application/json': { schema: successResponse(rideViewSchema) } },
      },
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
        description:
          'Active ride already exists, idempotency key reused with different parameters, quote expired, or pricing version mismatch',
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
    path: '/v1/rides/driver/earnings',
    tags: ['Rides'],
    summary: 'Get server-owned driver earnings summary in Asia/Kolkata business time (Driver only)',
    security: bearerAuth,
    request: {
      query: driverEarningsQuerySchema,
    },
    responses: {
      200: {
        description: 'Driver earnings summary retrieved successfully',
        content: {
          'application/json': {
            schema: successResponse(driverEarningsSummarySchema),
          },
        },
      },
      401: {
        description: 'Authentication required',
        content: { 'application/json': { schema: errorResponse } },
      },
      403: {
        description: 'Driver profile required',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/v1/rides/driver/history',
    tags: ['Rides'],
    summary: 'List paginated ride history with server-owned settlement breakdown (Driver only)',
    security: bearerAuth,
    request: {
      query: driverHistoryQuerySchema,
    },
    responses: {
      200: {
        description: 'Paginated driver ride history retrieved successfully',
        content: {
          'application/json': {
            schema: successResponse(paginatedRidesSchema),
          },
        },
      },
      401: {
        description: 'Authentication required',
        content: { 'application/json': { schema: errorResponse } },
      },
      403: {
        description: 'Driver profile required',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/v1/rides/admin/reconcile-earnings',
    tags: ['Rides'],
    summary:
      'Audit historical ride settlement entries or run guarded idempotent online earnings backfill (Finance/Super Admin)',
    security: bearerAuth,
    request: {
      body: {
        content: {
          'application/json': {
            schema: reconcileDriverEarningsSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Reconciliation report',
        content: {
          'application/json': {
            schema: successResponse(driverEarningsReconciliationSchema),
          },
        },
      },
      400: {
        description: 'Validation error or missing explicit rideIds on backfill',
        content: { 'application/json': { schema: errorResponse } },
      },
      403: {
        description: 'Finance or Super Admin role required',
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
                riderArrearsPaise: z.number().int().optional(),
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
                  arrearsCollectedPaise: z.number().int().optional(),
                  totalPayablePaise: z.number().int().optional(),
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
    summary:
      'List open or resolved payment disputes with settlement and refund evidence (Super, Support, or Finance Admin)',
    request: { query: listPaymentDisputesQuerySchema },
    security: bearerAuth,
    responses: {
      200: {
        description: 'Open disputes',
        content: {
          'application/json': {
            schema: successResponse(
              z.array(
                z.object({
                  ride: rideViewSchema,
                  ticket: z.any().nullable(),
                  resolution: z.any().nullable(),
                  evidence: z.object({
                    paymentCollection: z.enum(['DIRECT', 'CASH', 'RAZORPAY_TEST', 'RAZORPAY_UPI']),
                    paymentMethod: z.string().nullable(),
                    paymentConfirmedAt: z.string().nullable(),
                    providerOrderId: z.string().nullable(),
                    providerPaymentId: z.string().nullable(),
                    providerQrId: z.string().nullable(),
                    commissionChargedPaise: z.number().int(),
                    commissionRefundedPaise: z.number().int(),
                    refundTransactionId: z.string().nullable(),
                    onlineEarningsCreditedPaise: z.number().int(),
                  }),
                }),
              ),
            ),
          },
        },
      },
      403: {
        description: 'Admin role required',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/v1/rides/{id}/cancellation-fee/waive',
    tags: ['Rides'],
    summary:
      'Waive an unpaid rider cancellation or no-show fee via compensating credit (Support/Finance/Super Admin)',
    security: bearerAuth,
    request: {
      params: rideIdParamSchema,
      body: { content: { 'application/json': { schema: waiveCancellationFeeSchema } } },
    },
    responses: {
      200: {
        description: 'Cancellation fee waived',
        content: {
          'application/json': {
            schema: successResponse(
              z.object({
                ride: rideViewSchema,
                waivedPaise: z.number().int(),
                riderWalletBalancePaise: z.number().int(),
                riderArrearsPaise: z.number().int(),
              }),
            ),
          },
        },
      },
      400: {
        description: 'Ride is not cancelled or had no cancellation fee',
        content: { 'application/json': { schema: errorResponse } },
      },
      403: {
        description: 'Admin role required',
        content: { 'application/json': { schema: errorResponse } },
      },
      404: {
        description: 'Ride not found',
        content: { 'application/json': { schema: errorResponse } },
      },
      409: {
        description: 'Arrears already settled on a subsequent ride',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  const ridePaymentQrViewSchema = z.object({
    ride: rideViewSchema,
    qr: z.object({
      state: z.enum(['NONE', 'PENDING', 'PAID', 'EXPIRED']),
      upiUri: z.string().nullable(),
      imageUrl: z.string().nullable(),
      expiresAt: z.string().nullable(),
      amountPaise: z.number().int(),
      lines: z.array(
        z.object({
          label: z.string(),
          amountPaise: z.number().int(),
        }),
      ),
    }),
  });

  for (const method of ['post', 'get'] as const) {
    registry.registerPath({
      method,
      path: '/v1/rides/{id}/payment-qr',
      tags: ['Rides'],
      summary:
        method === 'post'
          ? 'Create or reuse single-use Razorpay UPI QR for driver fare collection'
          : 'Poll Razorpay UPI QR payment status for assigned driver',
      security: bearerAuth,
      request: { params: rideIdParamSchema },
      responses: {
        200: {
          description: 'Ride and UPI QR payment state',
          content: { 'application/json': { schema: successResponse(ridePaymentQrViewSchema) } },
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
          description: 'Ride is not awaiting payment',
          content: { 'application/json': { schema: errorResponse } },
        },
      },
    });
  }
}
