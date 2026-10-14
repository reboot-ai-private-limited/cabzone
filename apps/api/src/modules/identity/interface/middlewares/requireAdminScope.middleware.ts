import type { Request, RequestHandler } from 'express';
import { AppError } from '../../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../../shared/http/asyncHandler.js';
import type { AdminUserRepositoryPort } from '../../domain/index.js';

/** Undefined scopes a list; null requires global administration. */
export type AdminScopeResolver = (req: Request) => Promise<string[] | null | undefined>;

export function makeRequireAdminScope(adminRepo: AdminUserRepositoryPort) {
  return (resolve: AdminScopeResolver): RequestHandler => asyncHandler(async (req, _res, next) => {
    if (!req.auth) throw AppError.unauthenticated('Authentication required.');
    const admin = await adminRepo.findByUserId(req.auth.userId);
    if (!admin || admin.status !== 'ACTIVE' || admin.role !== req.auth.role ||
      !['SUPER_ADMIN', 'CITY_ADMIN'].includes(admin.role)) {
      throw AppError.forbidden('ADMIN_SCOPE_REQUIRED: Active administration permission required.');
    }
    if (admin.role === 'SUPER_ADMIN') return next();
    req.adminCityZoneIds = [...admin.cityZoneIds];
    const cities = await resolve(req);
    if (cities === null || cities?.some((id) => !admin.cityZoneIds.includes(id))) {
      throw AppError.forbidden('ADMIN_SCOPE_DENIED: Resource is outside your assigned cities.');
    }
    next();
  });
}
