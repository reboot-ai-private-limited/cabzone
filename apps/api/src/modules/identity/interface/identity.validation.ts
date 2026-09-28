import { z } from 'zod';
import {
  ADMIN_ROLES,
  ADMIN_STATUSES,
  DRIVER_KYC_STATUSES,
  DRIVER_OPERATIONAL_STATUSES,
  DRIVER_STATUSES,
  E164_PHONE_REGEX,
  USER_STATUSES,
} from '@Cabzone/contracts';

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
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email('Invalid email address').optional(),
  preferredLanguage: z.string().trim().min(2).max(10).optional(),
  emergencyContact: z
    .object({
      name: z.string().trim().min(1).max(100),
      phoneE164: phoneE164Schema,
    })
    .nullable()
    .optional(),
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
  userId: z.string().uuid('Invalid userId UUID'),
  role: z.enum(ADMIN_ROLES),
  cityZoneIds: z.array(z.string().uuid()).default([]),
});

export const userStatusSchema = z.enum(USER_STATUSES);
export const driverStatusSchema = z.enum(DRIVER_STATUSES);
export const driverKycStatusSchema = z.enum(DRIVER_KYC_STATUSES);
export const adminStatusSchema = z.enum(ADMIN_STATUSES);
