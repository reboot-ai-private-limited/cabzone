import { Router, type RequestHandler } from 'express';

export interface RiderRouterDeps {
  authenticate: RequestHandler;
  requireRider: RequestHandler;
  getProfile: RequestHandler;
  updateProfile: RequestHandler;
}

export function buildRiderRouter(deps: RiderRouterDeps): Router {
  const router = Router();

  router.use(deps.authenticate);
  router.use(deps.requireRider);

  router.get('/me', deps.getProfile);
  router.patch('/me', deps.updateProfile);

  return router;
}

export interface AdminRiderRouterDeps {
  authenticate: RequestHandler;
  requireAdminRole: RequestHandler;
  listRiders: RequestHandler;
  getRider: RequestHandler;
  updateStatus: RequestHandler;
  updateProfile: RequestHandler;
}

export function buildAdminRiderRouter(deps: AdminRiderRouterDeps): Router {
  const router = Router();

  router.use(deps.authenticate);
  router.use(deps.requireAdminRole);

  router.get('/', deps.listRiders);
  router.get('/:id', deps.getRider);
  router.patch('/:id/status', deps.updateStatus);
  router.patch('/:id', deps.updateProfile);

  return router;
}
