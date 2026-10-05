import { z } from 'zod';
import {
  ADMIN_ROLES,
  ADMIN_STATUSES,
  DRIVER_KYC_STATUSES,
  DRIVER_OPERATIONAL_STATUSES,
  DRIVER_STATUSES,
  E164_PHONE_REGEX,
  USER_STATUSES,
} from '@cabzone/contracts';

export const phoneE164Schema = z
  .string()
  .trim()
  .regex(E164_PHONE_REGEX, 'Must be a valid E.164 phone number (e.g. +919876543210)');

export const requestOtpSchema = z.object({
  phoneE164: phoneE164Schema,
});

export const verifyOtpSchema = z.object({
  phoneE164: phoneE164Schema,
  otp: z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only digits'),
  deviceId: z.string().min(1, 'deviceId is required').max(128),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
  deviceId: z.string().min(1, 'deviceId is required').max(128),
});

export const updateRiderProfileSchema = z.object({
  name: z.string().trim().min(1).max(100).nullable().optional(),
  email: z.string().trim().email('Invalid email address').nullable().optional(),
  preferredLanguage: z.string().trim().min(2).max(10).nullable().optional(),
  emergencyContact: z
    .object({
      name: z.string().trim().min(1).max(100),
      phoneE164: phoneE164Schema,
    })
    .nullable()
    .optional(),
});

export const listRidersQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(USER_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const updateRiderStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

export const riderIdParamSchema = z.object({
  id: z.string().uuid('Invalid riderId UUID'),
});

export const createDriverProfileSchema = z.object({
  userId: z.string().uuid('Invalid userId UUID'),
  walletId: z.string().uuid('Invalid walletId UUID'),
  currentVehicleId: z.string().uuid('Invalid vehicleId UUID').nullable().optional(),
});

export const updateDriverOperationalStatusSchema = z.object({
  operationalStatus: z.enum(DRIVER_OPERATIONAL_STATUSES),
});

export const createAdminUserSchema = z.object({
  phoneE164: phoneE164Schema,
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().email('Invalid email address').nullable().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100).optional(),
  role: z.enum(ADMIN_ROLES),
  cityZoneIds: z.array(z.string().uuid()).optional().default([]),
});

export const updateAdminUserSchema = z.object({
  name: z.string().trim().min(1).max(100).nullable().optional(),
  email: z.string().trim().email('Invalid email address').nullable().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100).optional(),
  role: z.enum(ADMIN_ROLES).optional(),
  cityZoneIds: z.array(z.string().uuid()).optional(),
});

export const adminLoginSchema = z.object({
  phoneE164: phoneE164Schema,
  password: z.string().min(1, 'Password is required'),
  deviceId: z.string().min(1).max(128).optional().default('admin-web-console'),
});

export const updateAdminUserStatusSchema = z.object({
  status: z.enum(ADMIN_STATUSES),
  reason: z.string().trim().max(250).nullable().optional(),
});

export const listAdminUsersQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.enum(ADMIN_ROLES).optional(),
  status: z.enum(ADMIN_STATUSES).optional(),
  zoneId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const adminUserIdParamSchema = z.object({
  id: z.string().uuid('Invalid adminUserId UUID'),
});


export const userStatusSchema = z.enum(USER_STATUSES);
export const driverStatusSchema = z.enum(DRIVER_STATUSES);
export const driverKycStatusSchema = z.enum(DRIVER_KYC_STATUSES);
export const adminStatusSchema = z.enum(ADMIN_STATUSES);
