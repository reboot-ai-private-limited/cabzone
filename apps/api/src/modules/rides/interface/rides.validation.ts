import { z } from 'zod';
import {
  CANCELLATION_REASONS,
  E164_PHONE_REGEX,
  NEGOTIATION_ACTIONS,
  PAYMENT_METHODS,
  RIDE_STATUSES,
  VEHICLE_CATEGORIES,
} from '@cabzone/contracts';

export const upiPaymentProofSchema = z
  .object({
    orderId: z.string().regex(/^order_[a-zA-Z0-9]+$/),
    paymentId: z.string().regex(/^pay_[a-zA-Z0-9]+$/),
    signature: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const locationPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().trim().max(255).nullable().optional(),
});

export const passengerSchema = z.object({
  riderId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1, 'Passenger name is required').max(100),
  phoneE164: z.string().trim().regex(E164_PHONE_REGEX, 'Must be a valid E.164 phone number'),
});

export const requestRideSchema = z.object({
  passenger: passengerSchema,
  vehicleCategory: z.enum(VEHICLE_CATEGORIES),
  pickup: locationPointSchema,
  drop: locationPointSchema,
  proposedFarePaise: z.number().int().positive().optional(),
});

export const proposeFareSchema = z.object({
  proposedFarePaise: z.number().int().positive('Proposed fare must be positive'),
});

export const respondNegotiationSchema = z.object({
  action: z.enum(['ACCEPTED', 'REJECTED'] as const),
  reasonCode: z.string().trim().max(100).nullable().optional(),
});

export const driverCounterSchema = z.object({
  proposedFarePaise: z.number().int().positive('Counter fare must be positive'),
});

export const counterResponseSchema = z.object({
  driverId: z.string().uuid(),
  action: z.enum(['ACCEPTED', 'REJECTED'] as const),
});

export const cancelRideSchema = z.object({
  reason: z.enum(CANCELLATION_REASONS),
});

export const waiveCancellationFeeSchema = z.object({
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(1000),
});

export const rideStatusSchema = z.enum(RIDE_STATUSES);
export const negotiationActionSchema = z.enum(NEGOTIATION_ACTIONS);
export const cancellationReasonSchema = z.enum(CANCELLATION_REASONS);

export const createRideRequestSchema = z.object({
  quoteToken: z.string().trim().min(1, 'quoteToken is required'),
  proposedFarePaise: z.number().int().positive('Proposed fare must be positive'),
  passenger: passengerSchema.pick({ name: true, phoneE164: true }),
  vehicleCategory: z.enum(VEHICLE_CATEGORIES),
  pickup: locationPointSchema,
  drop: locationPointSchema,
  riderId: z.string().uuid().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
});

export const startRideRequestSchema = z.object({
  otp: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'OTP must be 4 digits'),
  driverId: z.string().uuid().optional(),
});

export const rideIdParamSchema = z.object({ id: z.string().uuid() });

export const paymentDisputeSchema = z.object({ reason: z.string().trim().min(10).max(1000) });
export const paymentDisputeResolutionSchema = z.object({
  outcome: z.enum(['RIDER_WINS', 'DRIVER_WINS']),
  reason: z.string().trim().min(10).max(1000),
});

export const listRidesQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()) : undefined))
    .pipe(z.array(rideStatusSchema).optional()),
  riderId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
