import { z } from 'zod';
import {
  DOCUMENT_TYPES,
  DOCUMENT_VERIFICATION_STATUSES,
  DRIVER_APPLICATION_STATUSES,
  INDIAN_VEHICLE_REG_REGEX,
  REJECTION_TYPES,
  VEHICLE_CATEGORIES,
  VEHICLE_VERIFICATION_STATUSES,
} from '@cabzone/contracts';

export const vehicleRegistrationSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    INDIAN_VEHICLE_REG_REGEX,
    'Must be a valid Indian vehicle registration number (e.g. WB74AB1234)',
  );

export const createDriverProfileRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(100).nullish(),
    profilePhotoDataUrl: z
      .string()
      .max(820_000)
      .regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/)
      .refine((value) => {
        const encoded = value.split(',')[1];
        if (!encoded || value.length > 820_000) return false;
        const bytes = Buffer.from(encoded, 'base64');
        const jpeg =
          value.startsWith('data:image/jpeg;') &&
          bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
        const png =
          value.startsWith('data:image/png;') &&
          bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        return bytes.length <= 600 * 1024 && (jpeg || png);
      }, 'Use a JPEG or PNG photo smaller than 600 KB.')
      .nullish(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullish(),
    dateOfBirth: z.string().date().nullish(),
    address: z.string().trim().max(500).nullish(),
    dlNumber: z.string().trim().max(50).nullish(),
    dlExpiry: z.string().date().nullish(),
    alternatePhone: z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/)
      .nullish(),
    emergencyContact: z.string().trim().max(255).nullish(),
  })
  .strict();

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

export const uploadDriverLicenseFileRequestSchema = z.object({
  fileDataUrl: z.string().min(1).max(700_000).optional(),
  dlNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8,16}$/, 'Invalid driving licence number'),
  expiresAt: z.coerce.date(),
});

export const uploadVehicleDocumentFileRequestSchema = z.object({
  type: z.enum(['REGISTRATION_CERTIFICATE', 'INSURANCE', 'PERMIT']),
  fileDataUrl: z.string().min(1).max(700_000),
  expiresAt: z.coerce.date(),
});

export const uploadIdentityDocumentFileRequestSchema = z.object({
  fileDataUrl: z.string().min(1).max(700_000),
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

export const listDriverApplicationsQuerySchema = z.object({
  status: driverApplicationStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const updateDriverStatusRequestSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED'] as const),
  reason: z.string().trim().max(255).nullish(),
});
