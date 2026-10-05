import { Router, type RequestHandler } from 'express';

export interface AdminDispatchRouterDeps {
  authenticate: RequestHandler;
  requireAdminRole: RequestHandler;
  listFleet: RequestHandler;
  simulateFleet: RequestHandler;
}

export function buildAdminDispatchRouter(deps: AdminDispatchRouterDeps): Router {
  const router = Router();
  router.use(deps.authenticate);
  router.use(deps.requireAdminRole);
  router.get('/fleet', deps.listFleet);
  router.post('/simulate-fleet', deps.simulateFleet);
  return router;
}
