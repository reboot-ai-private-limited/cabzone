import { Router, type RequestHandler } from 'express';
import type { walletMoneyControllers } from './walletMoney.controller.js';

export interface AdminWalletRouterDeps {
  money: ReturnType<typeof walletMoneyControllers>;
  authenticate: RequestHandler;
  requireFinanceRole: RequestHandler;
  adjustWallet: RequestHandler;
  getWallet: RequestHandler;
  listWallets: RequestHandler;
  getStats: RequestHandler;
  listTransactions: RequestHandler;
  reconcileLedger?: RequestHandler | undefined;
}

export function buildAdminWalletRouter(deps: AdminWalletRouterDeps): Router {
  const router = Router();
  router.use(deps.authenticate);
  router.use(deps.requireFinanceRole);
  router.get('/stats', deps.getStats);
  router.get('/cashouts', deps.money.cashouts);
  router.post('/cashouts/:id/resolve', deps.money.resolve);
  router.post('/cashouts/:id/sync', deps.money.syncCashout);
  router.get('/transactions', deps.listTransactions);
  router.get('/', deps.listWallets);
  router.post('/adjustments', deps.adjustWallet);
  if (deps.reconcileLedger) {
    router.post('/reconcile', deps.reconcileLedger);
  }
  router.get('/:driverId', deps.getWallet);
  return router;
}

export interface DriverWalletRouterDeps {
  money: ReturnType<typeof walletMoneyControllers>;
  authenticate: RequestHandler;
  requireDriver: RequestHandler;
  getMyWallet: RequestHandler;
  listMyTransactions: RequestHandler;
}

export function buildDriverWalletRouter(deps: DriverWalletRouterDeps): Router {
  const router = Router();
  // Razorpay server-to-server notifications: authenticated by HMAC signature, not by user token.
  router.post('/webhook', deps.money.webhook);
  router.get('/recharge-checkout', deps.money.page);
  router.post('/recharge-checkout/session', deps.money.session);
  router.post('/recharge-checkout/status', deps.money.status);
  router.use(deps.authenticate);
  router.use(deps.requireDriver);
  router.get('/me', deps.getMyWallet);
  router.get('/me/transactions', deps.listMyTransactions);
  router.get('/me/activity', deps.money.activity);
  router.post('/me/recharges', deps.money.recharge);
  router.post('/me/recharges/:id/status', deps.money.rechargeStatus);
  router.post('/me/cashouts', deps.money.cashout);
  return router;
}
