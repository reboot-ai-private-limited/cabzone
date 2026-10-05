import { Router, type RequestHandler } from 'express';

export interface AdminWalletRouterDeps {
  authenticate: RequestHandler;
  requireFinanceRole: RequestHandler;
  adjustWallet: RequestHandler;
  getWallet: RequestHandler;
  listWallets: RequestHandler;
  getStats: RequestHandler;
  listTransactions: RequestHandler;
}

export function buildAdminWalletRouter(deps: AdminWalletRouterDeps): Router {
  const router = Router();
  router.use(deps.authenticate);
  router.use(deps.requireFinanceRole);
  router.get('/stats', deps.getStats);
  router.get('/transactions', deps.listTransactions);
  router.get('/', deps.listWallets);
  router.post('/adjustments', deps.adjustWallet);
  router.get('/:driverId', deps.getWallet);
  return router;
}

export interface DriverWalletRouterDeps {
  authenticate: RequestHandler;
  requireDriver: RequestHandler;
  getMyWallet: RequestHandler;
}

export function buildDriverWalletRouter(deps: DriverWalletRouterDeps): Router {
  const router = Router();
  router.use(deps.authenticate);
  router.use(deps.requireDriver);
  router.get('/me', deps.getMyWallet);
  return router;
}
