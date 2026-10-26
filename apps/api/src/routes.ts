import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { generateOpenApiDocument } from '@/shared/http/swagger.util.js';
import type { AppContainers } from './container.js';
import { isProdLike } from './config/env.js';
import { makeRateLimit } from './shared/http/rateLimit.js';

export function buildApiRouter(c: AppContainers): Router {
  const router = Router();

  // Swagger Documentation
  const openApiDoc = generateOpenApiDocument();
  router.get('/docs/json', (_req, res) => {
    res.json(openApiDoc);
  });
  router.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDoc));

  router.use('/health', c.health.buildRouter());
  if (isProdLike) {
    router.use('/v1/auth/otp/request', makeRateLimit('otp-request', 10, 15 * 60_000));
    router.use('/v1/auth/otp/verify', makeRateLimit('otp-verify', 30, 15 * 60_000));
    router.use('/v1/pricing/quotes', makeRateLimit('quote', 60, 60_000));
  }
  router.use('/v1/auth', c.identity.buildAuthRouter());
  router.use('/v1/driver', c.identity.buildDriverRouter());
  if (c.identity.buildRiderRouter) {
    router.use('/v1/riders', c.identity.buildRiderRouter());
  }
  router.use('/v1/admin', c.identity.buildAdminDriverRouter());
  if (c.identity.buildAdminRiderRouter) {
    router.use('/v1/admin/riders', c.identity.buildAdminRiderRouter());
  }
  if (c.identity.buildAdminUserRouter) {
    router.use('/v1/admin/users', c.identity.buildAdminUserRouter());
  }
  router.use(
    '/v1/admin/zones',
    c.zone.buildAdminZoneRouter({
      authenticate: c.identity.authenticate,
      requireAdminRole: c.identity.requireAdminScope(async (req) => {
        const id = req.path.split('/')[1];
        if ((!id || id === 'validate') && req.method === 'GET') return undefined;
        const zone = id && id !== 'validate' ? await c.zone.zoneRepo.findById(id) : null;
        const cities: string[] = [];
        if (id && id !== 'validate') {
          if (!zone) return null;
          if (
            zone.zoneType === 'CITY' &&
            (req.method === 'DELETE' ||
              req.path.endsWith('/deactivate') ||
              req.path.endsWith('/activate') ||
              req.path.endsWith('/geometry'))
          ) {
            return null;
          }
          cities.push(zone.zoneType === 'CITY' ? zone.id : (zone.parentCityZoneId ?? ''));
        } else {
          if (req.body?.zoneType === 'CITY' || !req.body?.parentCityZoneId) return null;
          cities.push(req.body.parentCityZoneId);
        }
        if (req.body?.parentCityZoneId) cities.push(req.body.parentCityZoneId);
        if (req.body?.zoneType && zone && req.body.zoneType !== zone.zoneType) return null;
        return cities;
      }),
    }),
  );
  router.use('/v1/zones', c.zone.buildZoneRouter());

  router.use(
    '/v1/admin/pricing',
    c.pricing.buildAdminPricingRouter({
      authenticate: c.identity.authenticate,
      requireAdminRole: c.identity.requireAdminScope(async (req) => {
        const id = req.path.split('/')[2];
        if (!id && req.method === 'GET') return undefined;
        const config = id ? await c.pricing.pricingConfigRepo.findById(id) : null;
        if (id && (!config || config.level !== 'CITY' || !config.cityZoneId)) return null;
        if (!id) {
          const level =
            req.body?.level ??
            (req.body?.stateCode ? 'STATE' : req.body?.cityZoneId ? 'CITY' : 'GLOBAL');
          if (level !== 'CITY' || !req.body?.cityZoneId || req.body?.stateCode) return null;
        }
        if (req.body?.level && req.body.level !== 'CITY') return null;
        if (req.body?.stateCode) return null;
        const cities = config?.cityZoneId ? [config.cityZoneId] : [];
        if (req.body?.cityZoneId) cities.push(req.body.cityZoneId);
        return cities;
      }),
    }),
  );
  router.use('/v1/pricing', c.pricing.buildPricingRouter());
  const walletAuth = {
    authenticate: c.identity.authenticate,
    requireRole: c.identity.requireRole,
  };
  router.use('/v1/admin/wallets', c.ledger.buildAdminWalletRouter(walletAuth));
  router.use('/v1/driver/wallet', c.ledger.buildDriverWalletRouter(walletAuth));
  router.use('/v1/driver', c.dispatch.buildDispatchRouter(walletAuth));
  router.use('/v1/admin/dispatch', c.dispatch.buildAdminDispatchRouter(walletAuth));
  router.use(
    '/v1/rides',
    c.rides.buildRidesRouter({
      authenticate: c.identity.authenticate,
      requireRole: c.identity.requireRole,
    }),
  );
  router.use(
    '/v1/admin/routing',
    c.routing.buildAdminRoutingRouter({
      authenticate: c.identity.authenticate,
      requireSuperAdmin: c.identity.requireRole('SUPER_ADMIN'),
    }),
  );
  router.use('/v1/routing', c.routing.buildRoutingRouter());

  return router;
}
