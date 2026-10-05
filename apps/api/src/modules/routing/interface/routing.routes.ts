import { Router, type RequestHandler } from 'express';

export interface AdminRoutingRouterDeps {
  authenticate?: RequestHandler | undefined;
  requireSuperAdmin?: RequestHandler | undefined;
  getHealth: RequestHandler;
  getMetrics: RequestHandler;
}

export function buildAdminRoutingRouter(deps: AdminRoutingRouterDeps): Router {
  const router = Router();

  if (deps.authenticate) {
    router.use(deps.authenticate);
  }
  if (deps.requireSuperAdmin) {
    router.use(deps.requireSuperAdmin);
  }

  router.get('/health', deps.getHealth);
  router.get('/metrics', deps.getMetrics);

  return router;
}

export interface RoutingRouterDeps {
  reverseGeocode: RequestHandler;
}

export function buildRoutingRouter(deps: RoutingRouterDeps): Router {
  const router = Router();
  router.get('/reverse-geocode', deps.reverseGeocode);
  return router;
}
