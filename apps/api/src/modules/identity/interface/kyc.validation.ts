import { z } from 'zod';
import {
  DOCUMENT_TYPES,
  DOCUMENT_VERIFICATION_STATUSES,
  DRIVER_APPLICATION_STATUSES,
  INDIAN_VEHICLE_REG_REGEX,
  REJECTION_TYPES,
  VEHICLE_CATEGORIES,
  VEHICLE_VERIFICATION_STATUSES,
} from '@Cabzone/contracts';

export const vehicleRegistrationSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    INDIAN_VEHICLE_REG_REGEX,
    'Must be a valid Indian vehicle registration number (e.g. WB74AB1234)',
  );

export const createVehicleSchema = z.object({
  driverId: z.string().uuid('Invalid driverId UUID'),
  vehicleType: z.enum(VEHICLE_CATEGORIES),
  make: z.string().trim().min(1, 'Make is required').max(50),
  model: z.string().trim().min(1, 'Model is required').max(50),
  registrationNumber: vehicleRegistrationSchema,
  color: z.string().trim().min(1).max(30).nullable().optional(),
  manufactureYear: z
    .number()
    .int()
    .min(2000, 'Vehicle must not be older than year 2000')
    .max(new Date().getFullYear() + 1)
    .nullable()
    .optional(),
});

export const updateVehicleStatusSchema = z.object({
  verificationStatus: z.enum(VEHICLE_VERIFICATION_STATUSES),
});

export const submitDriverApplicationSchema = z.object({
  driverId: z.string().uuid('Invalid driverId UUID'),
});

export const reviewDriverApplicationSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED'] as const),
  rejectionType: z.enum(REJECTION_TYPES).nullable().optional(),
  rejectionReason: z.string().trim().max(255).nullable().optional(),
  reviewerAdminId: z.string().uuid('Invalid reviewerAdminId UUID'),
});

export const uploadDriverDocumentMetadataSchema = z.object({
  driverId: z.string().uuid('Invalid driverId UUID'),
  applicationId: z.string().uuid('Invalid applicationId UUID'),
  type: z.enum(DOCUMENT_TYPES),
  storageKey: z.string().trim().min(1, 'storageKey is required'),
  documentHash: z.string().length(64, 'documentHash must be a 64-character SHA-256 hash'),
  documentNumberMasked: z.string().trim().max(50).nullable().optional(),
  issuedAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

export const registerVehicleRequestSchema = z.object({
  vehicleType: z.enum(VEHICLE_CATEGORIES),
  make: z.string().trim().min(1, 'Make is required').max(50),
  model: z.string().trim().min(1, 'Model is required').max(50),
  registrationNumber: vehicleRegistrationSchema,
  color: z.string().trim().min(1).max(30).nullable().optional(),
  manufactureYear: z
    .number()
    .int()
    .min(2000, 'Vehicle must not be older than year 2000')
    .max(new Date().getFullYear() + 1)
    .nullable()
    .optional(),
});

export const uploadDriverDocumentRequestSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  storageKey: z.string().trim().min(1, 'storageKey is required'),
  documentHash: z.string().length(64, 'documentHash must be a 64-character SHA-256 hash'),
  documentNumberMasked: z.string().trim().max(50).nullable().optional(),
  issuedAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

export const reviewApplicationRequestSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED'] as const),
  rejectionType: z.enum(REJECTION_TYPES).nullable().optional(),
  rejectionReason: z.string().trim().max(255).nullable().optional(),
});

export const vehicleCategorySchema = z.enum(VEHICLE_CATEGORIES);
export const vehicleVerificationStatusSchema = z.enum(VEHICLE_VERIFICATION_STATUSES);
export const driverApplicationStatusSchema = z.enum(DRIVER_APPLICATION_STATUSES);
export const documentTypeSchema = z.enum(DOCUMENT_TYPES);
export const documentVerificationStatusSchema = z.enum(DOCUMENT_VERIFICATION_STATUSES);
