import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { generateOpenApiDocument } from '@/shared/http/swagger.util.js';
import type { AppContainers } from './container.js';

export function buildApiRouter(c: AppContainers): Router {
  const router = Router();

  // Swagger Documentation
  const openApiDoc = generateOpenApiDocument();
  router.get('/docs/json', (_req, res) => {
    res.json(openApiDoc);
  });
  router.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDoc));

  router.use('/health', c.health.buildRouter());
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
      requireAdminRole: c.identity.requireRole('SUPER_ADMIN', 'CITY_ADMIN'),
    }),
  );
  router.use('/v1/zones', c.zone.buildZoneRouter());

  router.use(
    '/v1/admin/pricing',
    c.pricing.buildAdminPricingRouter({
      authenticate: c.identity.authenticate,
      requireAdminRole: c.identity.requireRole('SUPER_ADMIN', 'CITY_ADMIN'),
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
