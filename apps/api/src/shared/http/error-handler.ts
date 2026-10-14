import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { logger } from '@/shared/logging/logger.js';
import { buildErrorBody } from './response.util.js';

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
        url: req.originalUrl,
        details: err.details,
        ...(err.isExpected ? {} : { stack: err.stack, cause: causeChain(err) }),
      },
      'request failed',
    );

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
    { url: req.originalUrl, err: String(err), stack, cause: causeChain(err) },
    'unhandled error',
  );

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
  res.status(404).json(
    buildErrorBody(req, {
      statusCode: 404,
      code: 'NOT_FOUND',
      message: `No route matches ${req.method} ${req.originalUrl}`,
    }),
  );
}
