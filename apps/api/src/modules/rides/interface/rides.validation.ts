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
