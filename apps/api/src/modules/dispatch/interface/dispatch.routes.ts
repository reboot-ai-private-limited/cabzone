import { Router, type RequestHandler } from 'express';
import { registerPushTokenSwaggerPaths } from './dispatch.swagger.js';

export interface PushTokenRouterDeps {
  authenticate: RequestHandler;
  registerPushToken: RequestHandler;
  unregisterPushToken: RequestHandler;
}

export interface DispatchRouterDeps extends PushTokenRouterDeps {
  requireDriver: RequestHandler;
  setStatus: RequestHandler;
  getStatus: RequestHandler;
  updateLocation: RequestHandler;
  listOffers: RequestHandler;
}

export function buildPushTokenRouter(deps: PushTokenRouterDeps): Router {
  registerPushTokenSwaggerPaths();
  const router = Router();
  router.use(deps.authenticate);
  router.post('/push-token', deps.registerPushToken);
  router.delete('/push-token', deps.unregisterPushToken);
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
