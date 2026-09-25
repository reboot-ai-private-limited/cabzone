import type { Request, RequestHandler, Response } from 'express';
import { sendSuccess } from '@/shared/http/response.util.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { AppError } from '@/shared/errors/AppError.js';
import type {
  LogoutUseCase,
  RefreshTokenUseCase,
  RequestOtpUseCase,
  VerifyOtpUseCase,
} from '../application/useCases/index.js';
import {
  refreshTokenSchema,
  requestOtpSchema,
  verifyOtpSchema,
} from './identity.validation.js';

export function makeRequestOtpController(useCase: RequestOtpUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const parsed = requestOtpSchema.parse(req.body);
    const result = await useCase.execute(parsed.phoneE164);
    sendSuccess(req, res, result, 'OTP sent successfully', 200);
  });
}

export function makeVerifyOtpController(useCase: VerifyOtpUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const parsed = verifyOtpSchema.parse(req.body);
    const result = await useCase.execute(parsed);
    sendSuccess(req, res, result, 'Authentication successful', 200);
  });
}

export function makeRefreshTokenController(useCase: RefreshTokenUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const parsed = refreshTokenSchema.parse(req.body);
    const result = await useCase.execute(parsed);
    sendSuccess(req, res, result, 'Token refreshed successfully', 200);
  });
}

export function makeLogoutController(useCase: LogoutUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) {
      throw AppError.unauthenticated('Authentication required.');
    }
    const result = await useCase.execute(req.auth.sessionId);
    sendSuccess(req, res, result, 'Logged out successfully', 200);
  });
}
