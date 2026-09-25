import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import type { AdminUserEntity, SessionEntity, SessionRepositoryPort } from '../src/modules/identity/domain/index.js';
import { JoseTokenAdapter } from '../src/modules/identity/infrastructure/joseToken.adapter.js';
import {
  makeAuthenticate,
  makeRequireZoneAccess,
  requireRole,
} from '../src/modules/identity/interface/middlewares/index.js';
import { AppError } from '../src/shared/errors/AppError.js';

const TEST_SECRET = 'this-is-a-super-secret-key-that-is-at-least-32-chars-long!';

function createMockReq(headers: Record<string, string> = {}): Request {
  return {
    headers,
  } as unknown as Request;
}

function createMockRes(): Response {
  return {} as unknown as Response;
}

function runMiddleware(
  middleware: (req: Request, res: Response, next: (err?: unknown) => void) => void,
  req: Request,
  res: Response = createMockRes()
): Promise<{ error?: unknown; nextCalled: boolean }> {
  return new Promise((resolve) => {
    middleware(req, res, (err?: unknown) => {
      resolve({ error: err, nextCalled: !err });
    });
  });
}

describe('JoseTokenAdapter', () => {
  const tokenService = new JoseTokenAdapter(TEST_SECRET);

  it('signs and verifies a valid access token', async () => {
    const payload = {
      sub: '018f0a00-0000-7000-8000-000000000001',
      sessionId: '018f0a00-0000-7000-8000-000000000002',
      role: 'RIDER' as const,
    };

    const token = await tokenService.signAccessToken(payload, '5m');
    expect(typeof token).toBe('string');

    const verified = await tokenService.verifyAccessToken(token);
    expect(verified.sub).toBe(payload.sub);
    expect(verified.sessionId).toBe(payload.sessionId);
    expect(verified.role).toBe(payload.role);
  });

  it('rejects an expired token', async () => {
    const payload = {
      sub: '018f0a00-0000-7000-8000-000000000001',
      sessionId: '018f0a00-0000-7000-8000-000000000002',
      role: 'RIDER' as const,
    };

    // Expired immediately
    const token = await tokenService.signAccessToken(payload, '0s');
    await expect(tokenService.verifyAccessToken(token)).rejects.toThrow();
  });

  it('rejects token signed with different secret', async () => {
    const otherService = new JoseTokenAdapter('different-super-secret-key-with-at-least-32-chars!');
    const token = await otherService.signAccessToken({
      sub: 'user-1',
      sessionId: 'session-1',
      role: 'DRIVER',
    });

    await expect(tokenService.verifyAccessToken(token)).rejects.toThrow();
  });
});

describe('authenticate Middleware', () => {
  const tokenService = new JoseTokenAdapter(TEST_SECRET);

  const activeSession: SessionEntity = {
    id: 'session-123',
    userId: 'user-123',
    deviceId: 'device-123',
    refreshTokenHash: 'hash',
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    lastUsedAt: new Date(),
    createdAt: new Date(),
  };

  const createMockSessionRepo = (session: SessionEntity | null): SessionRepositoryPort => ({
    findById: async () => session,
  });

  it('fails with 401 when Authorization header is missing', async () => {
    const authenticate = makeAuthenticate({
      tokenVerifier: tokenService,
      sessionRepo: createMockSessionRepo(activeSession),
    });

    const req = createMockReq();
    const { error } = await runMiddleware(authenticate, req);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(401);
    expect((error as AppError).message).toContain('authorization header');
  });

  it('fails with 401 when Authorization header does not start with Bearer', async () => {
    const authenticate = makeAuthenticate({
      tokenVerifier: tokenService,
      sessionRepo: createMockSessionRepo(activeSession),
    });

    const req = createMockReq({ authorization: 'Basic xyz' });
    const { error } = await runMiddleware(authenticate, req);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(401);
  });

  it('fails with 401 on invalid token signature', async () => {
    const authenticate = makeAuthenticate({
      tokenVerifier: tokenService,
      sessionRepo: createMockSessionRepo(activeSession),
    });

    const req = createMockReq({ authorization: 'Bearer invalid.token.here' });
    const { error } = await runMiddleware(authenticate, req);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(401);
    expect((error as AppError).message).toContain('Invalid or expired token');
  });

  it('fails with 401 when session does not exist in store', async () => {
    const authenticate = makeAuthenticate({
      tokenVerifier: tokenService,
      sessionRepo: createMockSessionRepo(null),
    });

    const token = await tokenService.signAccessToken({
      sub: 'user-123',
      sessionId: 'session-123',
      role: 'RIDER',
    });

    const req = createMockReq({ authorization: `Bearer ${token}` });
    const { error } = await runMiddleware(authenticate, req);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(401);
    expect((error as AppError).message).toContain('revoked or expired');
  });

  it('fails with 401 when session is revoked', async () => {
    const revokedSession: SessionEntity = {
      ...activeSession,
      revokedAt: new Date(),
    };

    const authenticate = makeAuthenticate({
      tokenVerifier: tokenService,
      sessionRepo: createMockSessionRepo(revokedSession),
    });

    const token = await tokenService.signAccessToken({
      sub: 'user-123',
      sessionId: 'session-123',
      role: 'RIDER',
    });

    const req = createMockReq({ authorization: `Bearer ${token}` });
    const { error } = await runMiddleware(authenticate, req);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(401);
    expect((error as AppError).message).toContain('revoked or expired');
  });

  it('fails with 401 when session userId does not match token sub', async () => {
    const mismatchedSession: SessionEntity = {
      ...activeSession,
      userId: 'different-user',
    };

    const authenticate = makeAuthenticate({
      tokenVerifier: tokenService,
      sessionRepo: createMockSessionRepo(mismatchedSession),
    });

    const token = await tokenService.signAccessToken({
      sub: 'user-123',
      sessionId: 'session-123',
      role: 'RIDER',
    });

    const req = createMockReq({ authorization: `Bearer ${token}` });
    const { error } = await runMiddleware(authenticate, req);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(401);
  });

  it('attaches req.auth and calls next on valid token and active session', async () => {
    const authenticate = makeAuthenticate({
      tokenVerifier: tokenService,
      sessionRepo: createMockSessionRepo(activeSession),
    });

    const token = await tokenService.signAccessToken({
      sub: 'user-123',
      sessionId: 'session-123',
      role: 'DRIVER',
    });

    const req = createMockReq({ authorization: `Bearer ${token}` });
    const { error, nextCalled } = await runMiddleware(authenticate, req);

    expect(error).toBeUndefined();
    expect(nextCalled).toBe(true);
    expect(req.auth).toEqual({
      userId: 'user-123',
      sessionId: 'session-123',
      role: 'DRIVER',
    });
  });
});

describe('requireRole Middleware', () => {
  it('fails with 401 if req.auth is missing', () => {
    const guard = requireRole('RIDER');
    const req = createMockReq();
    let error: unknown;

    guard(req, createMockRes(), (err) => {
      error = err;
    });

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(401);
  });

  it('fails with 403 if user role is not allowed', () => {
    const guard = requireRole('SUPER_ADMIN', 'CITY_ADMIN');
    const req = createMockReq();
    req.auth = {
      userId: 'user-1',
      sessionId: 'session-1',
      role: 'RIDER',
    };

    let error: unknown;
    guard(req, createMockRes(), (err) => {
      error = err;
    });

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(403);
    expect((error as AppError).message).toContain('Insufficient permissions');
  });

  it('calls next when user has an allowed role', () => {
    const guard = requireRole('SUPER_ADMIN', 'CITY_ADMIN');
    const req = createMockReq();
    req.auth = {
      userId: 'user-admin',
      sessionId: 'session-admin',
      role: 'SUPER_ADMIN',
    };

    let nextCalled = false;
    guard(req, createMockRes(), (err) => {
      if (!err) nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });
});

describe('requireZoneAccess Middleware', () => {
  const activeCityAdmin: AdminUserEntity = {
    id: 'admin-1',
    userId: 'user-admin-1',
    role: 'CITY_ADMIN',
    cityZoneIds: ['zone-siliguri-1', 'zone-siliguri-2'],
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const activeSuperAdmin: AdminUserEntity = {
    id: 'admin-2',
    userId: 'user-super-admin',
    role: 'SUPER_ADMIN',
    cityZoneIds: [],
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const suspendedAdmin: AdminUserEntity = {
    ...activeCityAdmin,
    userId: 'user-suspended',
    status: 'SUSPENDED',
  };

  const createMockAdminRepo = (admin: AdminUserEntity | null) => ({
    findByUserId: async () => admin,
  });

  it('fails with 401 when unauthenticated', async () => {
    const requireZoneAccess = makeRequireZoneAccess({
      adminRepo: createMockAdminRepo(activeCityAdmin),
    });

    const guard = requireZoneAccess(() => 'zone-siliguri-1');
    const req = createMockReq();
    const { error } = await runMiddleware(guard, req);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(401);
  });

  it('fails with 400 when zoneId extractor returns undefined', async () => {
    const requireZoneAccess = makeRequireZoneAccess({
      adminRepo: createMockAdminRepo(activeCityAdmin),
    });

    const guard = requireZoneAccess(() => undefined);
    const req = createMockReq();
    req.auth = { userId: 'user-admin-1', sessionId: 's1', role: 'CITY_ADMIN' };

    const { error } = await runMiddleware(guard, req);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(400);
    expect((error as AppError).message).toContain('Zone ID is required');
  });

  it('fails with 403 when city admin attempts to access unassigned zone', async () => {
    const requireZoneAccess = makeRequireZoneAccess({
      adminRepo: createMockAdminRepo(activeCityAdmin),
    });

    const guard = requireZoneAccess(() => 'zone-kolkata-1');
    const req = createMockReq();
    req.auth = { userId: 'user-admin-1', sessionId: 's1', role: 'CITY_ADMIN' };

    const { error } = await runMiddleware(guard, req);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(403);
    expect((error as AppError).message).toContain('permission to manage this zone');
  });

  it('allows city admin to access assigned zone', async () => {
    const requireZoneAccess = makeRequireZoneAccess({
      adminRepo: createMockAdminRepo(activeCityAdmin),
    });

    const guard = requireZoneAccess(() => 'zone-siliguri-1');
    const req = createMockReq();
    req.auth = { userId: 'user-admin-1', sessionId: 's1', role: 'CITY_ADMIN' };

    const { nextCalled } = await runMiddleware(guard, req);

    expect(nextCalled).toBe(true);
  });

  it('allows super admin to access any zone', async () => {
    const requireZoneAccess = makeRequireZoneAccess({
      adminRepo: createMockAdminRepo(activeSuperAdmin),
    });

    const guard = requireZoneAccess(() => 'zone-any-city-99');
    const req = createMockReq();
    req.auth = { userId: 'user-super-admin', sessionId: 's1', role: 'SUPER_ADMIN' };

    const { nextCalled } = await runMiddleware(guard, req);

    expect(nextCalled).toBe(true);
  });

  it('fails with 403 if admin account is suspended', async () => {
    const requireZoneAccess = makeRequireZoneAccess({
      adminRepo: createMockAdminRepo(suspendedAdmin),
    });

    const guard = requireZoneAccess(() => 'zone-siliguri-1');
    const req = createMockReq();
    req.auth = { userId: 'user-suspended', sessionId: 's1', role: 'CITY_ADMIN' };

    const { error } = await runMiddleware(guard, req);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(403);
  });
});
