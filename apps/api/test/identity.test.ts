import { describe, expect, it } from 'vitest';
import {
  AdminUserModel,
  canAdminManageZone,
  canDriverGoOnline,
  canUserAuthenticate,
  createAdminUserSchema,
  createDriverProfileSchema,
  DriverModel,
  isSessionActive,
  phoneE164Schema,
  RiderModel,
  SessionModel,
  updateRiderProfileSchema,
  UserModel,
  verifyOtpSchema,
  type AdminUserEntity,
  type DriverEntity,
  type SessionEntity,
  type UserEntity,
} from '../src/modules/identity/index.js';

describe('Identity Domain Invariants', () => {
  describe('canUserAuthenticate', () => {
    it('allows active user with verified phone', () => {
      const user: UserEntity = {
        id: '018f0a00-0000-7000-8000-000000000001',
        phoneE164: '+919876543210',
        phoneVerifiedAt: new Date(),
        status: 'ACTIVE',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(canUserAuthenticate(user)).toBe(true);
    });

    it('rejects user with unverified phone', () => {
      const user: UserEntity = {
        id: '018f0a00-0000-7000-8000-000000000001',
        phoneE164: '+919876543210',
        phoneVerifiedAt: null,
        status: 'ACTIVE',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(canUserAuthenticate(user)).toBe(false);
    });

    it('rejects suspended user even if phone is verified', () => {
      const user: UserEntity = {
        id: '018f0a00-0000-7000-8000-000000000001',
        phoneE164: '+919876543210',
        phoneVerifiedAt: new Date(),
        status: 'SUSPENDED',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(canUserAuthenticate(user)).toBe(false);
    });
  });

  describe('isSessionActive', () => {
    it('returns true when session is not revoked and not expired', () => {
      const session: SessionEntity = {
        id: '018f0a00-0000-7000-8000-000000000002',
        userId: '018f0a00-0000-7000-8000-000000000001',
        deviceId: 'device-abc',
        refreshTokenHash: 'hash123',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        lastUsedAt: new Date(),
        createdAt: new Date(),
      };
      expect(isSessionActive(session)).toBe(true);
    });

    it('returns false when session is revoked', () => {
      const session: SessionEntity = {
        id: '018f0a00-0000-7000-8000-000000000002',
        userId: '018f0a00-0000-7000-8000-000000000001',
        deviceId: 'device-abc',
        refreshTokenHash: 'hash123',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
        lastUsedAt: new Date(),
        createdAt: new Date(),
      };
      expect(isSessionActive(session)).toBe(false);
    });

    it('returns false when session is expired', () => {
      const session: SessionEntity = {
        id: '018f0a00-0000-7000-8000-000000000002',
        userId: '018f0a00-0000-7000-8000-000000000001',
        deviceId: 'device-abc',
        refreshTokenHash: 'hash123',
        expiresAt: new Date(Date.now() - 1_000),
        revokedAt: null,
        lastUsedAt: new Date(),
        createdAt: new Date(),
      };
      expect(isSessionActive(session)).toBe(false);
    });
  });

  describe('canDriverGoOnline (Authenticated ≠ Eligible)', () => {
    const baseDriver: DriverEntity = {
      id: '018f0a00-0000-7000-8000-000000000010',
      userId: '018f0a00-0000-7000-8000-000000000001',
      status: 'ACTIVE',
      kycStatus: 'VERIFIED',
      operationalStatus: 'OFFLINE',
      ratingAverage: 4.8,
      ratingCount: 15,
      trustScore: 90,
      currentVehicleId: '018f0a00-0000-7000-8000-000000000099',
      walletId: '018f0a00-0000-7000-8000-000000000088',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('allows active verified driver with assigned vehicle to go online', () => {
      expect(canDriverGoOnline(baseDriver)).toEqual({ eligible: true });
    });

    it('blocks driver whose KYC is pending', () => {
      const driver = { ...baseDriver, kycStatus: 'PENDING' as const };
      const res = canDriverGoOnline(driver);
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain('KYC');
    });

    it('blocks driver with no vehicle assigned', () => {
      const driver = { ...baseDriver, currentVehicleId: null };
      const res = canDriverGoOnline(driver);
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain('vehicle');
    });

    it('blocks driver whose account is pending or suspended', () => {
      const driver = { ...baseDriver, status: 'PENDING' as const };
      const res = canDriverGoOnline(driver);
      expect(res.eligible).toBe(false);
      expect(res.reason).toContain('account');
    });
  });

  describe('canAdminManageZone', () => {
    it('allows super admin for any zone', () => {
      const admin: AdminUserEntity = {
        id: '018f0a00-0000-7000-8000-000000000020',
        userId: '018f0a00-0000-7000-8000-000000000001',
        role: 'SUPER_ADMIN',
        cityZoneIds: [],
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(canAdminManageZone(admin, 'zone-patna-1')).toBe(true);
    });

    it('checks city admin against assigned zones', () => {
      const admin: AdminUserEntity = {
        id: '018f0a00-0000-7000-8000-000000000021',
        userId: '018f0a00-0000-7000-8000-000000000001',
        role: 'CITY_ADMIN',
        cityZoneIds: ['zone-varanasi-1', 'zone-varanasi-2'],
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(canAdminManageZone(admin, 'zone-varanasi-1')).toBe(true);
      expect(canAdminManageZone(admin, 'zone-lucknow-1')).toBe(false);
    });
  });
});

describe('Identity Boundary Validations (Zod Schemas)', () => {
  it('validates E.164 phone numbers correctly', () => {
    expect(phoneE164Schema.safeParse('+919876543210').success).toBe(true);
    expect(phoneE164Schema.safeParse('+12025550123').success).toBe(true);

    // Invalid formats
    expect(phoneE164Schema.safeParse('9876543210').success).toBe(false);
    expect(phoneE164Schema.safeParse('09876543210').success).toBe(false);
    expect(phoneE164Schema.safeParse('+0123456789').success).toBe(false);
    expect(phoneE164Schema.safeParse('invalid-phone').success).toBe(false);
  });

  it('validates OTP verification payload', () => {
    const valid = {
      phoneE164: '+919876543210',
      otp: '123456',
      deviceId: 'android-uuid-1234',
    };
    expect(verifyOtpSchema.safeParse(valid).success).toBe(true);

    // Non-6-digit OTP
    expect(verifyOtpSchema.safeParse({ ...valid, otp: '12345' }).success).toBe(false);
    expect(verifyOtpSchema.safeParse({ ...valid, otp: '1234567' }).success).toBe(false);
    expect(verifyOtpSchema.safeParse({ ...valid, otp: 'abcdef' }).success).toBe(false);

    // Empty deviceId
    expect(verifyOtpSchema.safeParse({ ...valid, deviceId: '' }).success).toBe(false);
  });

  it('validates rider profile updates', () => {
    const valid = {
      name: 'Rohan Sharma',
      email: 'rohan@example.com',
      preferredLanguage: 'hi',
      emergencyContact: {
        name: 'Pooja Sharma',
        phoneE164: '+919876543211',
      },
    };
    expect(updateRiderProfileSchema.safeParse(valid).success).toBe(true);

    // Invalid email
    expect(updateRiderProfileSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);

    // Invalid emergency contact phone
    expect(
      updateRiderProfileSchema.safeParse({
        ...valid,
        emergencyContact: { name: 'Pooja', phoneE164: 'invalid' },
      }).success
    ).toBe(false);
  });

  it('validates driver profile creation UUIDs', () => {
    const valid = {
      userId: '018f0a00-0000-7000-8000-000000000001',
      walletId: '018f0a00-0000-7000-8000-000000000002',
      currentVehicleId: '018f0a00-0000-7000-8000-000000000003',
    };
    expect(createDriverProfileSchema.safeParse(valid).success).toBe(true);

    // Non-UUID
    expect(createDriverProfileSchema.safeParse({ ...valid, userId: 'not-a-uuid' }).success).toBe(false);
  });

  it('validates admin user creation', () => {
    const valid = {
      phoneE164: '+919876543210',
      name: 'City Admin',
      role: 'CITY_ADMIN',
      cityZoneIds: ['018f0a00-0000-7000-8000-000000000010'],
    };
    expect(createAdminUserSchema.safeParse(valid).success).toBe(true);
  });
});

describe('Mongoose Persistence Models', () => {
  it('registers models with correct collection names and indexes', () => {
    expect(UserModel.collection.name).toBe('users');
    expect(SessionModel.collection.name).toBe('sessions');
    expect(RiderModel.collection.name).toBe('riders');
    expect(DriverModel.collection.name).toBe('drivers');
    expect(AdminUserModel.collection.name).toBe('admin_users');
  });
});
