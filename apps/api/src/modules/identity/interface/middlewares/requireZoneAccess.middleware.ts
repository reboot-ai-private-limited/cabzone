import type { Request, RequestHandler } from 'express';
import { AppError } from '../../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../../shared/http/asyncHandler.js';
import {
  canAdminManageZone,
  type AdminUserRepositoryPort,
} from '../../domain/index.js';
import './auth.types.js';

export interface RequireZoneAccessDeps {
  adminRepo: AdminUserRepositoryPort;
}

export type ZoneIdExtractor = (req: Request) => string | undefined;

export function makeRequireZoneAccess(deps: RequireZoneAccessDeps) {
  return function requireZoneAccess(getZoneId: ZoneIdExtractor): RequestHandler {
    return asyncHandler(async (req, _res, next) => {
      if (!req.auth) {
        throw AppError.unauthenticated('Authentication required.');
      }

      const zoneId = getZoneId(req);
      if (!zoneId) {
        throw AppError.badRequest('Zone ID is required.');
      }

      const admin = await deps.adminRepo.findByUserId(req.auth.userId);
      if (!admin || !canAdminManageZone(admin, zoneId)) {
        throw AppError.forbidden('You do not have permission to manage this zone.');
      }

      next();
    });
  };
}
