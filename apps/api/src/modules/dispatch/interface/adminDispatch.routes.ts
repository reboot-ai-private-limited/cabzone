import { Router, type RequestHandler } from 'express';
import { allowDevShortcuts } from '../../../config/env.js';

export interface AdminDispatchRouterDeps {
  authenticate: RequestHandler;
  requireAdminRole: RequestHandler;
  requireSimulateRole?: RequestHandler | undefined;
  listFleet: RequestHandler;
  simulateFleet: RequestHandler;
}

export function buildAdminDispatchRouter(deps: AdminDispatchRouterDeps): Router {
  const router = Router();
  const simulateGuard = deps.requireSimulateRole ?? deps.requireAdminRole;
  router.use(deps.authenticate);
  router.get('/fleet', deps.requireAdminRole, deps.listFleet);
  if (allowDevShortcuts) {
    router.post('/simulate-fleet', simulateGuard, deps.simulateFleet);
  }
  return router;
}
