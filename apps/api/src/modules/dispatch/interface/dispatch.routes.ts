import { Router, type RequestHandler } from 'express';

export interface DispatchRouterDeps {
  authenticate: RequestHandler;
  requireDriver: RequestHandler;
  setStatus: RequestHandler;
  getStatus: RequestHandler;
  updateLocation: RequestHandler;
  listOffers: RequestHandler;
  registerPushToken: RequestHandler;
  unregisterPushToken: RequestHandler;
}

export function buildPushTokenRouter(
  deps: Pick<DispatchRouterDeps, 'authenticate' | 'registerPushToken' | 'unregisterPushToken'>,
): Router {
  const router = Router();
  router.use(deps.authenticate);
  router.post('/', deps.registerPushToken);
  router.delete('/', deps.unregisterPushToken);
  return router;
}

export function buildDispatchRouter(deps: DispatchRouterDeps): Router {
  const router = Router();
  router.use(deps.authenticate);
  router.use(deps.requireDriver);
  router.post('/status', deps.setStatus);
  router.get('/status', deps.getStatus);
  router.post('/location', deps.updateLocation);
  router.get('/offers', deps.listOffers);
  router.post('/push-token', deps.registerPushToken);
  router.delete('/push-token', deps.unregisterPushToken);
  return router;
}
