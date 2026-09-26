import { Router } from 'express';
import type { AppContainers } from './container.js';

export function buildApiRouter(c: AppContainers): Router {
  const router = Router();
  router.use('/health', c.health.buildRouter());
  router.use('/v1/auth', c.identity.buildAuthRouter());
  router.use('/v1/driver', c.identity.buildDriverRouter());
  router.use('/v1/admin', c.identity.buildAdminDriverRouter());
  router.use(
    '/v1/admin/zones',
    c.zone.buildAdminZoneRouter({
      authenticate: c.identity.authenticate,
      requireAdminRole: c.identity.requireRole('SUPER_ADMIN', 'CITY_ADMIN'),
    }),
  );
  router.use('/v1/zones', c.zone.buildZoneRouter());
  return router;
}
