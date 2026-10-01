import { z } from 'zod';
import {
  CANCELLATION_REASONS,
  E164_PHONE_REGEX,
  NEGOTIATION_ACTIONS,
  RIDE_STATUSES,
  VEHICLE_CATEGORIES,
} from '@cabzone/contracts';

export const locationPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().trim().max(255).nullable().optional(),
});

export const passengerSchema = z.object({
  riderId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1, 'Passenger name is required').max(100),
  phoneE164: z
    .string()
    .trim()
    .regex(E164_PHONE_REGEX, 'Must be a valid E.164 phone number'),
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

export const cancelRideSchema = z.object({
  reason: z.enum(CANCELLATION_REASONS),
});

export const rideStatusSchema = z.enum(RIDE_STATUSES);
export const negotiationActionSchema = z.enum(NEGOTIATION_ACTIONS);
export const cancellationReasonSchema = z.enum(CANCELLATION_REASONS);

export const createRideRequestSchema = z.object({
  quoteToken: z.string().trim().min(1, 'quoteToken is required'),
  proposedFarePaise: z.number().int().positive('Proposed fare must be positive'),
  passenger: passengerSchema.pick({ name: true, phoneE164: true }),
  vehicleCategory: z.enum(VEHICLE_CATEGORIES),
  pickup: locationPointSchema.pick({ lat: true, lng: true }),
  drop: locationPointSchema.pick({ lat: true, lng: true }),
});

export const startRideRequestSchema = z.object({
  otp: z.string().trim().regex(/^\d{4}$/, 'OTP must be 4 digits'),
});

export const rideIdParamSchema = z.object({ id: z.string().uuid() });

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
