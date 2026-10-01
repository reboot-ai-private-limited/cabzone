import express, { Router, type RequestHandler } from 'express';

export interface AdminStateRouterDeps {
  authenticate: RequestHandler;
  requireAdminRole: RequestHandler;
  requireSuperAdmin: RequestHandler;
  listStates: RequestHandler;
  importStates: RequestHandler;
  getState: RequestHandler;
  updateState: RequestHandler;
  activateState: RequestHandler;
  deactivateState: RequestHandler;
  stateHistory: RequestHandler;
}

export function buildAdminStateRouter(deps: AdminStateRouterDeps): Router {
  const router = Router();
  router.use(deps.authenticate);

  router.get('/', deps.requireAdminRole, deps.listStates);
  // Boundaries are reference GIS data that gates serviceability; only super admins replace them.
  // Whole-country GeoJSON files are large, so this route has its own body limit, applied only
  // after the caller is authenticated and authorised.
  router.post(
    '/import',
    deps.requireSuperAdmin,
    express.json({ limit: '30mb' }),
    deps.importStates,
  );

  // Registered after /import so the literal path is never read as a stateCode.
  router.get('/:stateCode', deps.requireAdminRole, deps.getState);
  router.get('/:stateCode/history', deps.requireAdminRole, deps.stateHistory);
  router.patch('/:stateCode', deps.requireSuperAdmin, deps.updateState);
  router.post('/:stateCode/activate', deps.requireSuperAdmin, deps.activateState);
  router.post('/:stateCode/deactivate', deps.requireSuperAdmin, deps.deactivateState);

  return router;
}
