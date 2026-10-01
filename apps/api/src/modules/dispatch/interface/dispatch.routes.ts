import { Router, type RequestHandler } from 'express';

export interface DispatchRouterDeps {
  authenticate: RequestHandler;
  requireDriver: RequestHandler;
  setStatus: RequestHandler;
  updateLocation: RequestHandler;
  listOffers: RequestHandler;
}

export function buildDispatchRouter(deps: DispatchRouterDeps): Router {
  const router = Router();
  router.use(deps.authenticate);
  router.use(deps.requireDriver);
  router.post('/status', deps.setStatus);
  router.post('/location', deps.updateLocation);
  router.get('/offers', deps.listOffers);
  return router;
}
