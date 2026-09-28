import { Router, type RequestHandler } from 'express';

export interface AdminZoneRouterDeps {
  authenticate: RequestHandler;
  requireAdminRole: RequestHandler;
  createZone: RequestHandler;
  validateZone: RequestHandler;
  updateZone: RequestHandler;
  updateZoneGeometry: RequestHandler;
  getZone: RequestHandler;
  listZones: RequestHandler;
  activateZone: RequestHandler;
  deactivateZone: RequestHandler;
  getZoneHistory: RequestHandler;
  getZoneDependents: RequestHandler;
}

export function buildAdminZoneRouter(deps: AdminZoneRouterDeps): Router {
  const router = Router();

  router.use(deps.authenticate);
  router.use(deps.requireAdminRole);

  router.post('/', deps.createZone);
  router.post('/validate', deps.validateZone);
  router.get('/', deps.listZones);
  router.get('/:id', deps.getZone);
  router.patch('/:id', deps.updateZone);
  router.patch('/:id/geometry', deps.updateZoneGeometry);
  router.post('/:id/activate', deps.activateZone);
  router.post('/:id/deactivate', deps.deactivateZone);
  router.get('/:id/history', deps.getZoneHistory);
  router.get('/:id/dependents', deps.getZoneDependents);

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
