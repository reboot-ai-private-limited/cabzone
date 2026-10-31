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

export interface AdminRiderEmergencyContactDto {
  name: string;
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

export interface RiderRideStatsDto {
  totalRides: number;
  completedRides: number;
  cancelledRides: number;
  totalSpentPaise: number;
}

export type TrustTier = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'UNRATED';

export interface TrustScoreBreakdownDto {
  score: number | null;
  tier: TrustTier;
  isPreliminary: boolean;
  isPublic?: boolean | undefined;
  factors: {
    completedRides: number;
    cancelledRides: number;
    completionRate: number;
    ratingAverage: number | null;
    ratingCount: number;
    disputesCount: number;
    noShowsCount?: number | undefined;
  };
  summary: string;
}

export interface AdminRiderSummaryDto {
  id: string;
  userId: string;
  status: UserStatus;
  name: string | null;
  email: string | null;
  preferredLanguage: string | null;
  emergencyContact: AdminRiderEmergencyContactDto | null;
  ratingAverage: number | null;
  ratingCount: number;
  trustScore?: number | null | undefined;
  trustScoreBreakdown?: TrustScoreBreakdownDto | undefined;
  totalRides: number;
  completedRides: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRiderDetailDto extends AdminRiderSummaryDto {
  cancelledRides: number;
  totalSpentPaise: number;
}

export interface ListRidersQueryDto {
  search?: string | undefined;
  status?: UserStatus | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface ListRidersResponseDto {
  riders: AdminRiderSummaryDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface UpdateRiderStatusDto {
  status: 'ACTIVE' | 'SUSPENDED';
}

export interface UpdateRiderProfileDto {
  name?: string | null | undefined;
  email?: string | null | undefined;
  preferredLanguage?: string | null | undefined;
  emergencyContact?: EmergencyContactDto | null | undefined;
}

export interface AdminUpdateRiderProfileDto {
  name?: string | null | undefined;
  email?: string | null | undefined;
  preferredLanguage?: string | null | undefined;
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
  name?: string | null | undefined;
  profilePhotoUrl?: string | null | undefined;
  gender?: string | null | undefined;
  dateOfBirth?: string | null | undefined;
  address?: string | null | undefined;
  dlNumber?: string | null | undefined;
  dlExpiry?: string | null | undefined;
  alternatePhone?: string | null | undefined;
  emergencyContact?: string | null | undefined;
  status: DriverStatus;
  kycStatus: DriverKycStatus;
  operationalStatus: DriverOperationalStatus;
  currentVehicleId: string | null;
  walletId: string;
  ratingAverage: number | null;
  ratingCount: number;
  trustScore: number | null;
  trustScoreBreakdown?: TrustScoreBreakdownDto | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface SaveDriverProfileRequestDto {
  name?: string | null;
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | null;
  dateOfBirth?: string | null;
  profilePhotoDataUrl?: string | null;
  address?: string | null;
  dlNumber?: string | null;
  dlExpiry?: string | null;
  alternatePhone?: string | null;
  emergencyContact?: string | null;
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
  deviceId?: string | undefined;
}

export const ADMIN_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type AdminStatus = (typeof ADMIN_STATUSES)[number];

export interface AdminUserDto {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  role: AdminRole;
  cityZoneIds: string[];
  status: AdminStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserSummaryDto {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  role: AdminRole;
  cityZoneIds: string[];
  status: AdminStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserCityZoneDto {
  id: string;
  name: string;
  code?: string | undefined;
}

export interface AdminUserDetailDto extends AdminUserSummaryDto {
  cityZones?: AdminUserCityZoneDto[] | undefined;
}

export interface ListAdminUsersQueryDto {
  search?: string | undefined;
  role?: AdminRole | undefined;
  status?: AdminStatus | undefined;
  zoneId?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface ListAdminUsersResponseDto {
  admins: AdminUserSummaryDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateAdminUserDto {
  phoneE164: string;
  name: string;
  email?: string | null | undefined;
  password?: string | undefined;
  role: AdminRole;
  cityZoneIds?: string[] | undefined;
}

export interface UpdateAdminUserDto {
  name?: string | null | undefined;
  email?: string | null | undefined;
  password?: string | undefined;
  role?: AdminRole | undefined;
  cityZoneIds?: string[] | undefined;
}

export interface UpdateAdminUserStatusDto {
  status: AdminStatus;
  reason?: string | null | undefined;
}

export interface AdminLoginRequestDto {
  phoneE164: string;
  password: string;
  deviceId?: string | undefined;
}

export interface AdminLoginResponseDto {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: {
    id: string;
    phoneE164: string;
    name?: string | null | undefined;
    role: AdminRole;
  };
}

export interface AdminRolePermissionDto {
  role: AdminRole;
  title: string;
  description: string;
  tier: 'SYSTEM' | 'REGIONAL' | 'OPERATIONS' | 'FINANCE';
  permissions: Array<{
    module: string;
    action: string;
    description: string;
  }>;
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
