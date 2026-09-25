import type { RequestHandler } from 'express';
import { AppError } from '../../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../../shared/http/asyncHandler.js';
import {
  isSessionActive,
  type SessionRepositoryPort,
  type TokenVerifierPort,
} from '../../domain/index.js';
import './auth.types.js';

export interface AuthenticateDeps {
  tokenVerifier: TokenVerifierPort;
  sessionRepo: SessionRepositoryPort;
}

export function makeAuthenticate(deps: AuthenticateDeps): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw AppError.unauthenticated('Missing or invalid authorization header.');
    }

    const token = authHeader.slice(7).trim();
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

    req.auth = {
      userId: payload.sub,
      sessionId: payload.sessionId,
      role: payload.role,
    };

    next();
  });
}
