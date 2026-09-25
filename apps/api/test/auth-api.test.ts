import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import {
  LogoutUseCase,
  RefreshTokenUseCase,
  RequestOtpUseCase,
  VerifyOtpUseCase,
} from '../src/modules/identity/application/useCases/index.js';
import type {
  AdminUserEntity,
  AdminUserRepositoryPort,
  DriverEntity,
  DriverRepositoryPort,
  RiderEntity,
  RiderRepositoryPort,
  SessionEntity,
  SessionRepositoryPort,
  UserEntity,
  UserRepositoryPort,
} from '../src/modules/identity/domain/index.js';
import {
  buildAuthRouter,
  makeLogoutController,
  makeRefreshTokenController,
  makeRequestOtpController,
  makeVerifyOtpController,
} from '../src/modules/identity/index.js';
import {
  ConsoleSmsGatewayAdapter,
  JoseTokenAdapter,
  MemoryOtpStoreAdapter,
} from '../src/modules/identity/infrastructure/index.js';
import { makeAuthenticate, makeRequireZoneAccess, requireRole } from '../src/modules/identity/interface/middlewares/index.js';
import { AppError } from '../src/shared/errors/AppError.js';

const TEST_SECRET = 'this-is-a-super-secret-key-that-is-at-least-32-chars-long!';
const TEST_PEPPER = 'this-is-a-super-secret-pepper-that-is-at-least-32-chars-long!';

class MemoryUserRepository implements UserRepositoryPort {
  private readonly users = new Map<string, UserEntity>();

  async findById(userId: string): Promise<UserEntity | null> {
    return this.users.get(userId) ?? null;
  }

  async findByPhone(phoneE164: string): Promise<UserEntity | null> {
    for (const u of this.users.values()) {
      if (u.phoneE164 === phoneE164) return { ...u };
    }
    return null;
  }

  async create(user: UserEntity): Promise<UserEntity> {
    this.users.set(user.id, { ...user });
    return { ...user };
  }

  async update(user: UserEntity): Promise<UserEntity> {
    this.users.set(user.id, { ...user });
    return { ...user };
  }
}

class MemoryRiderRepository implements RiderRepositoryPort {
  private readonly riders = new Map<string, RiderEntity>();

  async findByUserId(userId: string): Promise<RiderEntity | null> {
    for (const r of this.riders.values()) {
      if (r.userId === userId) return { ...r };
    }
    return null;
  }

  async create(rider: RiderEntity): Promise<RiderEntity> {
    this.riders.set(rider.id, { ...rider });
    return { ...rider };
  }
}

class MemoryDriverRepository implements DriverRepositoryPort {
  private readonly drivers = new Map<string, DriverEntity>();

  async findById(driverId: string): Promise<DriverEntity | null> {
    return this.drivers.get(driverId) ?? null;
  }

  async findByUserId(userId: string): Promise<DriverEntity | null> {
    for (const d of this.drivers.values()) {
      if (d.userId === userId) return { ...d };
    }
    return null;
  }

  async create(driver: DriverEntity): Promise<DriverEntity> {
    this.drivers.set(driver.id, { ...driver });
    return { ...driver };
  }

  async update(driver: DriverEntity): Promise<DriverEntity> {
    this.drivers.set(driver.id, { ...driver });
    return { ...driver };
  }
}

class MemoryAdminUserRepository implements AdminUserRepositoryPort {
  private readonly admins = new Map<string, AdminUserEntity>();

  async findByUserId(userId: string): Promise<AdminUserEntity | null> {
    for (const a of this.admins.values()) {
      if (a.userId === userId) return { ...a };
    }
    return null;
  }

  async create(admin: AdminUserEntity): Promise<AdminUserEntity> {
    this.admins.set(admin.id, { ...admin });
    return { ...admin };
  }
}

class MemorySessionRepository implements SessionRepositoryPort {
  private readonly sessions = new Map<string, SessionEntity>();

  async findById(sessionId: string): Promise<SessionEntity | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async findByTokenHash(tokenHash: string): Promise<SessionEntity | null> {
    for (const s of this.sessions.values()) {
      if (s.refreshTokenHash === tokenHash || s.previousRefreshTokenHash === tokenHash) return { ...s };
    }
    return null;
  }

  async findByUserIdAndDeviceId(userId: string, deviceId: string): Promise<SessionEntity | null> {
    for (const s of this.sessions.values()) {
      if (s.userId === userId && s.deviceId === deviceId) return { ...s };
    }
    return null;
  }

  async save(session: SessionEntity): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  async revoke(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.revokedAt = new Date();
      this.sessions.set(sessionId, s);
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    for (const [id, s] of this.sessions.entries()) {
      if (s.userId === userId) {
        s.revokedAt = new Date();
        this.sessions.set(id, s);
      }
    }
  }
}

describe('Auth Use Cases', () => {
  it('handles OTP request, cooldown enforcement, and verification lifecycle', async () => {
    const otpStore = new MemoryOtpStoreAdapter();
    const smsGateway = new ConsoleSmsGatewayAdapter();
    const userRepo = new MemoryUserRepository();
    const riderRepo = new MemoryRiderRepository();
    const sessionRepo = new MemorySessionRepository();
    const tokenAdapter = new JoseTokenAdapter(TEST_SECRET);

    const requestOtp = new RequestOtpUseCase({
      otpStore,
      smsGateway,
      otpPepper: TEST_PEPPER,
      devFixedOtp: '654321',
      cooldownSeconds: 60,
    });

    const verifyOtp = new VerifyOtpUseCase({
      otpStore,
      userRepo,
      riderRepo,
      sessionRepo,
      tokenSigner: tokenAdapter,
      otpPepper: TEST_PEPPER,
    });

    // 1. Request OTP
    const reqRes = await requestOtp.execute('+919876543210');
    expect(reqRes.phoneE164).toBe('+919876543210');
    expect(reqRes.expiresInSeconds).toBe(300);
    expect(smsGateway.sentOtps.get('+919876543210')).toBe('654321');

    // 2. Reject re-request within cooldown
    await expect(requestOtp.execute('+919876543210')).rejects.toThrow(AppError);

    // 3. Reject invalid OTP and increment attempt
    await expect(
      verifyOtp.execute({
        phoneE164: '+919876543210',
        otp: '000000',
        deviceId: 'device-1',
      }),
    ).rejects.toThrow('Invalid OTP');

    // 4. Verify valid OTP -> creates user and rider
    const authResult = await verifyOtp.execute({
      phoneE164: '+919876543210',
      otp: '654321',
      deviceId: 'device-1',
    });

    expect(authResult.accessToken).toBeDefined();
    expect(authResult.refreshToken).toBeDefined();
    expect(authResult.user.isNewUser).toBe(true);
    expect(authResult.user.phoneE164).toBe('+919876543210');

    // 5. Subsequent request for existing user
    await otpStore.delete('+919876543210');
    await requestOtp.execute('+919876543210');
    const loginResult = await verifyOtp.execute({
      phoneE164: '+919876543210',
      otp: '654321',
      deviceId: 'device-1',
    });
    expect(loginResult.user.isNewUser).toBe(false);
  });

  it('handles refresh token rotation and detects reuse to revoke session family', async () => {
    const sessionRepo = new MemorySessionRepository();
    const tokenAdapter = new JoseTokenAdapter(TEST_SECRET);

    const refreshTokenUseCase = new RefreshTokenUseCase({
      sessionRepo,
      tokenSigner: tokenAdapter,
    });

    const initialSession: SessionEntity = {
      id: 'session-abc',
      userId: 'user-xyz',
      deviceId: 'device-xyz',
      refreshTokenHash: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae', // hash of "foo"
      previousRefreshTokenHash: null,
      expiresAt: new Date(Date.now() + 86400_000),
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    };
    await sessionRepo.save(initialSession);

    // 1. Successful rotation
    const refreshed = await refreshTokenUseCase.execute({
      refreshToken: 'foo',
      deviceId: 'device-xyz',
    });
    expect(refreshed.accessToken).toBeDefined();
    expect(refreshed.refreshToken).not.toBe('foo');

    // 2. Reusing old rotated token triggers reuse detection
    await expect(
      refreshTokenUseCase.execute({
        refreshToken: 'foo',
        deviceId: 'device-xyz',
      }),
    ).rejects.toThrow('AUTH_REFRESH_REUSE_DETECTED');

    // 3. Verifying session family was revoked due to reuse
    const revokedSession = await sessionRepo.findById('session-abc');
    expect(revokedSession?.revokedAt).not.toBeNull();

    // 4. Using the active rotated token now fails because session family was revoked
    await expect(
      refreshTokenUseCase.execute({
        refreshToken: refreshed.refreshToken,
        deviceId: 'device-xyz',
      }),
    ).rejects.toThrow('revoked or expired');
  });

  it('handles logout revocation', async () => {
    const sessionRepo = new MemorySessionRepository();
    const logoutUseCase = new LogoutUseCase({
      sessionRepo,
    });

    const session: SessionEntity = {
      id: 'session-logout',
      userId: 'user-xyz',
      deviceId: 'device-xyz',
      refreshTokenHash: 'somehash',
      previousRefreshTokenHash: null,
      expiresAt: new Date(Date.now() + 86400_000),
      revokedAt: null,
      lastUsedAt: new Date(),
      createdAt: new Date(),
    };
    await sessionRepo.save(session);

    await logoutUseCase.execute('session-logout');
    const revoked = await sessionRepo.findById('session-logout');
    expect(revoked?.revokedAt).not.toBeNull();
  });

  it('derives role from persisted identity state on verify and refresh', async () => {
    const userRepo = new MemoryUserRepository();
    const riderRepo = new MemoryRiderRepository();
    const driverRepo = new MemoryDriverRepository();
    const adminRepo = new MemoryAdminUserRepository();
    const sessionRepo = new MemorySessionRepository();
    const tokenAdapter = new JoseTokenAdapter(TEST_SECRET);
    const otpStore = new MemoryOtpStoreAdapter();

    const verifyOtpUseCase = new VerifyOtpUseCase({
      otpStore,
      userRepo,
      riderRepo,
      driverRepo,
      adminRepo,
      sessionRepo,
      tokenSigner: tokenAdapter,
      otpPepper: TEST_PEPPER,
    });

    const refreshTokenUseCase = new RefreshTokenUseCase({
      sessionRepo,
      tokenSigner: tokenAdapter,
      userRepo,
      riderRepo,
      driverRepo,
      adminRepo,
    });

    // 1. Driver user logs in -> gets DRIVER role
    const now = new Date();
    await userRepo.create({
      id: 'driver-user-1',
      phoneE164: '+919876543211',
      phoneVerifiedAt: now,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await driverRepo.create({
      id: 'driver-prof-1',
      userId: 'driver-user-1',
      status: 'PENDING',
      kycStatus: 'PENDING',
      operationalStatus: 'OFFLINE',
      ratingAverage: null,
      ratingCount: 0,
      trustScore: null,
      currentVehicleId: null,
      walletId: 'wallet-1',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    const hmacDriver = require('node:crypto')
      .createHmac('sha256', TEST_PEPPER)
      .update('123456')
      .digest('hex');
    await otpStore.save({
      phoneE164: '+919876543211',
      otpHmac: hmacDriver,
      attempts: 0,
      expiresAt: new Date(Date.now() + 300_000),
      lastSentAt: now,
    });

    const driverVerify = await verifyOtpUseCase.execute({
      phoneE164: '+919876543211',
      otp: '123456',
      deviceId: 'dev-driver',
    });
    expect(driverVerify.user.role).toBe('DRIVER');

    const decodedDriverToken = await tokenAdapter.verifyAccessToken(driverVerify.accessToken);
    expect(decodedDriverToken.role).toBe('DRIVER');

    // 2. Admin user logs in -> gets Admin role
    await userRepo.create({
      id: 'admin-user-1',
      phoneE164: '+919876543212',
      phoneVerifiedAt: now,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await adminRepo.create({
      id: 'admin-prof-1',
      userId: 'admin-user-1',
      role: 'CITY_ADMIN',
      cityZoneIds: ['zone-1'],
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });

    const hmacAdmin = require('node:crypto')
      .createHmac('sha256', TEST_PEPPER)
      .update('123456')
      .digest('hex');
    await otpStore.save({
      phoneE164: '+919876543212',
      otpHmac: hmacAdmin,
      attempts: 0,
      expiresAt: new Date(Date.now() + 300_000),
      lastSentAt: now,
    });

    const adminVerify = await verifyOtpUseCase.execute({
      phoneE164: '+919876543212',
      otp: '123456',
      deviceId: 'dev-admin',
    });
    expect(adminVerify.user.role).toBe('CITY_ADMIN');
    const decodedAdminToken = await tokenAdapter.verifyAccessToken(adminVerify.accessToken);
    expect(decodedAdminToken.role).toBe('CITY_ADMIN');

    // 3. User refreshes and role is re-derived from updated state
    // Let's create a rider user who later gets a driver profile
    await userRepo.create({
      id: 'rider-to-driver',
      phoneE164: '+919876543213',
      phoneVerifiedAt: now,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await riderRepo.create({
      id: 'rider-prof-1',
      userId: 'rider-to-driver',
      name: 'Rider Person',
      email: null,
      emergencyContact: null,
      preferredLanguage: null,
      ratingAverage: null,
      ratingCount: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    const sessionRider: SessionEntity = {
      id: 'session-r2d',
      userId: 'rider-to-driver',
      deviceId: 'dev-r2d',
      refreshTokenHash: require('node:crypto').createHash('sha256').update('r2d-token').digest('hex'),
      previousRefreshTokenHash: null,
      expiresAt: new Date(Date.now() + 86400_000),
      revokedAt: null,
      lastUsedAt: now,
      createdAt: now,
    };
    await sessionRepo.save(sessionRider);

    const initialRefresh = await refreshTokenUseCase.execute({
      refreshToken: 'r2d-token',
      deviceId: 'dev-r2d',
    });
    const tokenBeforeDriver = await tokenAdapter.verifyAccessToken(initialRefresh.accessToken);
    expect(tokenBeforeDriver.role).toBe('RIDER');

    // Now user registers as driver
    await driverRepo.create({
      id: 'driver-prof-r2d',
      userId: 'rider-to-driver',
      status: 'PENDING',
      kycStatus: 'PENDING',
      operationalStatus: 'OFFLINE',
      ratingAverage: null,
      ratingCount: 0,
      trustScore: null,
      currentVehicleId: null,
      walletId: 'wallet-2',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    // Refreshing with the new token re-derives role as DRIVER
    const secondRefresh = await refreshTokenUseCase.execute({
      refreshToken: initialRefresh.refreshToken,
      deviceId: 'dev-r2d',
    });
    const tokenAfterDriver = await tokenAdapter.verifyAccessToken(secondRefresh.accessToken);
    expect(tokenAfterDriver.role).toBe('DRIVER');

    // 4. Suspended user cannot refresh
    await userRepo.update({
      id: 'rider-to-driver',
      phoneE164: '+919876543213',
      phoneVerifiedAt: now,
      status: 'SUSPENDED',
      version: 2,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      refreshTokenUseCase.execute({
        refreshToken: secondRefresh.refreshToken,
        deviceId: 'dev-r2d',
      }),
    ).rejects.toThrow('User account is suspended or deactivated');
  });
});

describe('Auth HTTP Endpoints (Supertest)', () => {
  function createTestApp() {
    const userRepo = new MemoryUserRepository();
    const riderRepo = new MemoryRiderRepository();
    const sessionRepo = new MemorySessionRepository();
    const tokenAdapter = new JoseTokenAdapter(TEST_SECRET);
    const otpStore = new MemoryOtpStoreAdapter();
    const smsGateway = new ConsoleSmsGatewayAdapter();

    const requestOtpUseCase = new RequestOtpUseCase({
      otpStore,
      smsGateway,
      otpPepper: TEST_PEPPER,
      devFixedOtp: '123456',
    });

    const verifyOtpUseCase = new VerifyOtpUseCase({
      otpStore,
      userRepo,
      riderRepo,
      sessionRepo,
      tokenSigner: tokenAdapter,
      otpPepper: TEST_PEPPER,
    });

    const refreshTokenUseCase = new RefreshTokenUseCase({
      sessionRepo,
      tokenSigner: tokenAdapter,
      userRepo,
      riderRepo,
    });

    const logoutUseCase = new LogoutUseCase({
      sessionRepo,
    });

    const authenticate = makeAuthenticate({
      tokenVerifier: tokenAdapter,
      sessionRepo,
    });

    const identityContainer = {
      buildAuthRouter: () =>
        buildAuthRouter({
          requestOtp: makeRequestOtpController(requestOtpUseCase),
          verifyOtp: makeVerifyOtpController(verifyOtpUseCase),
          refreshToken: makeRefreshTokenController(refreshTokenUseCase),
          logout: makeLogoutController(logoutUseCase),
          authenticate,
        }),
      buildDriverRouter: () => {
        const { Router } = require('express');
        return Router();
      },
      buildAdminDriverRouter: () => {
        const { Router } = require('express');
        return Router();
      },
      authenticate,
      requireRole,
      requireZoneAccess: makeRequireZoneAccess({
        adminRepo: {
          findByUserId: async () => null,
        },
      }),
    };

    return {
      app: createApp({ identity: identityContainer }),
      smsGateway,
    };
  }

  it('runs complete HTTP auth flow end-to-end', async () => {
    const { app } = createTestApp();

    // 1. POST /api/v1/auth/otp/request
    const reqRes = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phoneE164: '+919876543210' })
      .expect(200);

    expect(reqRes.body.success).toBe(true);
    expect(reqRes.body.data.phoneE164).toBe('+919876543210');

    // 2. POST /api/v1/auth/otp/verify
    const verifyRes = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({
        phoneE164: '+919876543210',
        otp: '123456',
        deviceId: 'device-mobile-1',
      })
      .expect(200);

    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.accessToken).toBeDefined();
    expect(verifyRes.body.data.refreshToken).toBeDefined();
    expect(verifyRes.body.data.user.role).toBe('RIDER');

    const { accessToken, refreshToken } = verifyRes.body.data;

    // 3. POST /api/v1/auth/refresh
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken,
        deviceId: 'device-mobile-1',
      })
      .expect(200);

    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.data.accessToken).toBeDefined();
    expect(refreshRes.body.data.refreshToken).not.toBe(refreshToken);

    const rotatedAccessToken = refreshRes.body.data.accessToken;

    // 4. POST /api/v1/auth/logout with Bearer token
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${rotatedAccessToken}`)
      .expect(200);

    expect(logoutRes.body.success).toBe(true);
    expect(logoutRes.body.data.message).toBe('Logged out successfully');

    // 5. Subsequent request with revoked token fails with 401
    await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${rotatedAccessToken}`)
      .expect(401);
  });

  it('detects refresh token reuse over HTTP, revoking the session family', async () => {
    const { app } = createTestApp();

    await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phoneE164: '+919876543299' })
      .expect(200);

    const verifyRes = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({
        phoneE164: '+919876543299',
        otp: '123456',
        deviceId: 'device-reuse-test',
      })
      .expect(200);

    const token1 = verifyRes.body.data.refreshToken;

    // 1. Rotate token1 -> token2
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken: token1,
        deviceId: 'device-reuse-test',
      })
      .expect(200);

    const token2 = refreshRes.body.data.refreshToken;
    expect(token2).not.toBe(token1);

    // 2. Reuse token1 -> 401 AUTH_REFRESH_REUSE_DETECTED
    const reuseRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken: token1,
        deviceId: 'device-reuse-test',
      })
      .expect(401);

    expect(reuseRes.body.message).toContain('AUTH_REFRESH_REUSE_DETECTED');

    // 3. Attempting to use token2 now fails because the session family was revoked
    await request(app)
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken: token2,
        deviceId: 'device-reuse-test',
      })
      .expect(401);
  });

  it('rejects invalid request formats with 400', async () => {
    const { app } = createTestApp();

    await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phoneE164: 'invalid-phone' })
      .expect(400);

    await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phoneE164: '+919876543210', otp: '123', deviceId: '' })
      .expect(400);
  });
});
