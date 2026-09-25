/**
 * User Identity and Role Profile Contracts
 */

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'DELETED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const E164_PHONE_REGEX = /^\+[1-9]\d{1,14}$/;

export interface UserDto {
  id: string;
  phoneE164: string;
  phoneVerifiedAt: string | null;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SessionDto {
  id: string;
  userId: string;
  deviceId: string;
  expiresAt: string;
  lastUsedAt: string;
  createdAt: string;
}

export interface EmergencyContactDto {
  name: string;
  phoneE164: string;
}

export interface RiderDto {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  emergencyContact: EmergencyContactDto | null;
  preferredLanguage: string | null;
  ratingAverage: number | null;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

export const DRIVER_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'] as const;
export type DriverStatus = (typeof DRIVER_STATUSES)[number];

export const DRIVER_KYC_STATUSES = ['PENDING', 'VERIFIED', 'EXPIRED', 'FAILED'] as const;
export type DriverKycStatus = (typeof DRIVER_KYC_STATUSES)[number];

export const DRIVER_OPERATIONAL_STATUSES = ['OFFLINE', 'ONLINE', 'BUSY'] as const;
export type DriverOperationalStatus = (typeof DRIVER_OPERATIONAL_STATUSES)[number];

export interface DriverDto {
  id: string;
  userId: string;
  status: DriverStatus;
  kycStatus: DriverKycStatus;
  operationalStatus: DriverOperationalStatus;
  currentVehicleId: string | null;
  walletId: string;
  ratingAverage: number | null;
  ratingCount: number;
  trustScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export const ADMIN_ROLES = ['SUPER_ADMIN', 'CITY_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const AUTH_ROLES = ['RIDER', 'DRIVER', ...ADMIN_ROLES] as const;
export type AuthRole = (typeof AUTH_ROLES)[number];

export interface AuthTokenPayload {
  sub: string;
  sessionId: string;
  role: AuthRole;
}

export interface AuthContext {
  userId: string;
  sessionId: string;
  role: AuthRole;
}

export const ADMIN_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type AdminStatus = (typeof ADMIN_STATUSES)[number];

export interface AdminUserDto {
  id: string;
  userId: string;
  role: AdminRole;
  cityZoneIds: string[];
  status: AdminStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RequestOtpRequestDto {
  phoneE164: string;
}

export interface RequestOtpResponseDto {
  phoneE164: string;
  expiresInSeconds: number;
  retryAfterSeconds: number;
}

export interface VerifyOtpRequestDto {
  phoneE164: string;
  otp: string;
  deviceId: string;
}

export interface AuthenticatedUserSummary {
  id: string;
  phoneE164: string;
  role: AuthRole;
  isNewUser: boolean;
}

export interface VerifyOtpResponseDto {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthenticatedUserSummary;
}

export interface RefreshTokenRequestDto {
  refreshToken: string;
  deviceId: string;
}

export interface RefreshTokenResponseDto {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface LogoutResponseDto {
  message: string;
}

