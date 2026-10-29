import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { logger } from '@/shared/logging/logger.js';
import { emitOperationalAlert } from '@/shared/monitoring/alerting.js';
import { buildErrorBody } from './response.util.js';

function stripQuery(url: string): string {
  return url.split('?')[0] ?? url;
}

function causeChain(err: unknown, depth = 0): string | undefined {
  if (!(err instanceof Error) || err.cause === undefined || depth > 4) return undefined;
  const cause = err.cause;
  const head = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  const rest = causeChain(cause, depth + 1);
  return rest === undefined ? head : `${head} <- ${rest}`;
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const safePath = stripQuery(req.originalUrl);

  if (
    err !== null &&
    typeof err === 'object' &&
    'type' in err &&
    err.type === 'entity.parse.failed'
  ) {
    res.status(400).json(
      buildErrorBody(req, {
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: 'Request body must be valid JSON.',
      }),
    );
    return;
  }

  if (err instanceof AppError) {
    logger[err.isExpected ? 'info' : 'error'](
      {
        code: err.code,
        status: err.statusCode,
        url: safePath,
        details: err.details,
        ...(err.isExpected ? {} : { stack: err.stack, cause: causeChain(err) }),
      },
      'request failed',
    );

    if (err.statusCode >= 500) {
      void emitOperationalAlert({
        category: 'API_5XX',
        severity: 'critical',
        dedupeKey: `API_5XX:${req.method}:${safePath}:${err.statusCode}`,
        summary: `API ${err.statusCode} on ${req.method} ${safePath}`,
        metadata: { method: req.method, path: safePath, statusCode: err.statusCode, code: err.code },
      });
    }

    res.status(err.statusCode).json(
      buildErrorBody(req, {
        statusCode: err.statusCode,
        code: err.code,
        message: err.message,
        publicDetails: err.publicDetails,
        details: err.details,
        stack: err.stack,
      }),
    );
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json(
      buildErrorBody(req, {
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: 'Some of the details provided are not valid.',
        publicDetails: err.issues,
      }),
    );
    return;
  }

  const stack = err instanceof Error ? err.stack : undefined;
  logger.error(
    { url: safePath, err: String(err), stack, cause: causeChain(err) },
    'unhandled error',
  );
  void emitOperationalAlert({
    category: 'API_5XX',
    severity: 'critical',
    dedupeKey: `API_5XX:${req.method}:${safePath}:500`,
    summary: `Unhandled API 500 on ${req.method} ${safePath}`,
    metadata: { method: req.method, path: safePath, statusCode: 500 },
  });

  res.status(500).json(
    buildErrorBody(req, {
      statusCode: 500,
      code: 'INTERNAL',
      message: 'Something went wrong. Please try again shortly.',
      stack,
    }),
  );
}

export function notFoundHandler(req: Request, res: Response): void {
  const safePath = stripQuery(req.originalUrl);
  res.status(404).json(
    buildErrorBody(req, {
      statusCode: 404,
      code: 'NOT_FOUND',
      message: `No route matches ${req.method} ${safePath}`,
    }),
  );
}
