import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';

export function makeQuoteRateLimiter(options?: { windowMs?: number; max?: number }): RequestHandler {
  return rateLimit({
    windowMs: options?.windowMs ?? 60 * 1000, // 1 minute
    max: options?.max ?? 30, // 30 requests per minute
    keyGenerator: (req) =>
      (req as { auth?: { userId?: string } }).auth?.userId ?? req.ip ?? 'anonymous',
    validate: { keyGeneratorIpFallback: false },
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many quote requests. Please wait a moment before trying again.',
      },
    },
  });
}
