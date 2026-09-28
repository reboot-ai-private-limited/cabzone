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
