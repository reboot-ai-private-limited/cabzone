import type { FaultCode } from '@Cabzone/contracts';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: FaultCode;
  readonly details?: unknown;
  readonly publicDetails?: unknown;
  readonly isExpected: boolean;

  constructor(opts: {
    statusCode: number;
    code: FaultCode;
    message: string;
    details?: unknown;
    publicDetails?: unknown;
    isExpected?: boolean;
    cause?: unknown;
  }) {
    super(opts.message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'AppError';
    this.statusCode = opts.statusCode;
    this.code = opts.code;
    this.details = opts.details;
    this.publicDetails = opts.publicDetails;
    this.isExpected = opts.isExpected ?? true;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message: string, publicDetails?: unknown): AppError {
    return new AppError({ statusCode: 400, code: 'VALIDATION_FAILED', message, publicDetails });
  }

  static unauthenticated(message = 'Please sign in to continue.'): AppError {
    return new AppError({ statusCode: 401, code: 'UNAUTHENTICATED', message });
  }

  static forbidden(message = 'You do not have access to this.'): AppError {
    return new AppError({ statusCode: 403, code: 'FORBIDDEN', message });
  }

  static notFound(message = 'Not found.'): AppError {
    return new AppError({ statusCode: 404, code: 'NOT_FOUND', message });
  }

  static conflict(message: string, publicDetails?: unknown): AppError {
    return new AppError({ statusCode: 409, code: 'CONFLICT', message, publicDetails });
  }

  static internal(code: FaultCode = 'INTERNAL', details?: unknown, cause?: unknown): AppError {
    return new AppError({
      statusCode: 500,
      code,
      message: 'Something went wrong. Please try again shortly.',
      details,
      isExpected: false,
      cause,
    });
  }
}
