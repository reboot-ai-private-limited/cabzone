import type { RequestHandler } from 'express';
import type { AuthRole } from '@Cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import './auth.types.js';

export function requireRole(...allowedRoles: AuthRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      return next(AppError.unauthenticated('Authentication required.'));
    }

    if (!allowedRoles.includes(req.auth.role)) {
      return next(AppError.forbidden('Insufficient permissions.'));
    }

    next();
  };
}
