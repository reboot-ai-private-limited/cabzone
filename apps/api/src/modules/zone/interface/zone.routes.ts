import { Router, type RequestHandler } from 'express';

export interface AdminZoneRouterDeps {
  authenticate: RequestHandler;
  requireAdminRole: RequestHandler;
  createZone: RequestHandler;
  updateZone: RequestHandler;
  getZone: RequestHandler;
  listZones: RequestHandler;
}

export function buildAdminZoneRouter(deps: AdminZoneRouterDeps): Router {
  const router = Router();

  router.use(deps.authenticate);
  router.use(deps.requireAdminRole);

  router.post('/', deps.createZone);
  router.get('/', deps.listZones);
  router.get('/:id', deps.getZone);
  router.patch('/:id', deps.updateZone);

  return router;
}

export interface ZoneRouterDeps {
  resolveZones: RequestHandler;
}

export function buildZoneRouter(deps: ZoneRouterDeps): Router {
  const router = Router();

  router.post('/resolve', deps.resolveZones);

  return router;
}
