import type { RequestHandler } from 'express';
import { ADMIN_ROLES } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../../shared/http/asyncHandler.js';
import {
  isSessionActive,
  type AdminUserRepositoryPort,
  type SessionRepositoryPort,
  type TokenVerifierPort,
} from '../../domain/index.js';
import type { AuthContext } from './auth.types.js';
import './auth.types.js';

export interface AuthenticateDeps {
  tokenVerifier: TokenVerifierPort;
  sessionRepo: SessionRepositoryPort;
  adminRepo?: AdminUserRepositoryPort | undefined;
}

const ADMIN_ROLE_SET: ReadonlySet<string> = new Set(ADMIN_ROLES);

async function verifyBearerToken(
  deps: AuthenticateDeps,
  token: string,
): Promise<{ auth: AuthContext; adminCityZoneIds?: string[] }> {
  if (!token) {
    throw AppError.unauthenticated('Missing authorization token.');
  }

  let payload;
  try {
    payload = await deps.tokenVerifier.verifyAccessToken(token);
  } catch {
    throw AppError.unauthenticated('Invalid or expired token.');
  }

  const session = await deps.sessionRepo.findById(payload.sessionId);
  if (!session || !isSessionActive(session) || session.userId !== payload.sub) {
    throw AppError.unauthenticated('Session is revoked or expired.');
  }

  let adminCityZoneIds: string[] | undefined;
  if (deps.adminRepo && ADMIN_ROLE_SET.has(payload.role)) {
    const admin = await deps.adminRepo.findByUserId(payload.sub);
    if (!admin || admin.status !== 'ACTIVE' || admin.role !== payload.role) {
      throw AppError.forbidden(
        'ADMIN_ACCOUNT_INACTIVE: Administrative account is inactive or role has changed.',
      );
    }
    if (admin.role === 'CITY_ADMIN') {
      adminCityZoneIds = [...admin.cityZoneIds];
    }
  }

  return {
    auth: { userId: payload.sub, sessionId: payload.sessionId, role: payload.role, deviceId: session.deviceId },
    ...(adminCityZoneIds !== undefined ? { adminCityZoneIds } : {}),
  };
}

/** Verifies a bearer token and its live session; throws AppError.unauthenticated otherwise. */
export function makeTokenVerifier(deps: AuthenticateDeps): (token: string) => Promise<AuthContext> {
  return async (token) => (await verifyBearerToken(deps, token)).auth;
}

export function makeAuthenticate(deps: AuthenticateDeps): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw AppError.unauthenticated('Missing or invalid authorization header.');
    }

    const verified = await verifyBearerToken(deps, authHeader.slice(7).trim());
    req.auth = verified.auth;
    if (verified.adminCityZoneIds !== undefined) {
      req.adminCityZoneIds = verified.adminCityZoneIds;
    }
    next();
  });
}
