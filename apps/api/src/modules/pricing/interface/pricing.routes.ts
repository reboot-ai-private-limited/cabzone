import { Router, type RequestHandler } from 'express';

export interface AdminPricingRouterDeps {
  authenticate?: RequestHandler | undefined;
  requireAdminRole?: RequestHandler | undefined;
  createPricingConfig: RequestHandler;
  listPricingConfigs: RequestHandler;
  updatePricingConfig: RequestHandler;
  deletePricingConfig: RequestHandler;
  activatePricingConfig: RequestHandler;
}

export function buildAdminPricingRouter(deps: AdminPricingRouterDeps): Router {
  const router = Router();

  if (deps.authenticate) {
    router.use(deps.authenticate);
  }
  if (deps.requireAdminRole) {
    router.use(deps.requireAdminRole);
  }

  router.post('/configs', deps.createPricingConfig);
  router.get('/configs', deps.listPricingConfigs);
  router.patch('/configs/:id', deps.updatePricingConfig);
  router.delete('/configs/:id', deps.deletePricingConfig);
  router.post('/configs/:id/activate', deps.activatePricingConfig);

  return router;
}

export interface PricingRouterDeps {
  createQuote: RequestHandler;
}

export function buildPricingRouter(deps: PricingRouterDeps): Router {
  const router = Router();

  router.post('/quotes', deps.createQuote);

  return router;
}
