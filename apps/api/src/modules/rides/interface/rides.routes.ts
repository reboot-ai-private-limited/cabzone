import { Router, type RequestHandler } from 'express';

export interface RidesRouterDeps {
  authenticate: RequestHandler;
  requireRider: RequestHandler;
  requireDriver: RequestHandler;
  requireCanCancel: RequestHandler;
  requireParticipant?: RequestHandler | undefined;
  requireCanRead: RequestHandler;
  requireDisputeAdmin: RequestHandler;
  requireDisputeReadAdmin?: RequestHandler | undefined;
  requireFinanceAdmin: RequestHandler;
  createRide: RequestHandler;
  listRides: RequestHandler;
  driverEarnings: RequestHandler;
  driverHistory: RequestHandler;
  reconcileDriverEarnings: RequestHandler;
  getRide: RequestHandler;
  getRideEvents: RequestHandler;
  acceptRide: RequestHandler;
  driverCounter: RequestHandler;
  raiseFare: RequestHandler;
  respondCounter: RequestHandler;
  driverEnRoute: RequestHandler;
  driverArrived: RequestHandler;
  startRide: RequestHandler;
  completeRide: RequestHandler;
  confirmPayment: RequestHandler;
  createUpiPayment: RequestHandler;
  upiSession: RequestHandler;
  switchToCash: RequestHandler;
  upiWebhook: RequestHandler;
  verifyUpiPayment: RequestHandler;
  upiPaymentStatus: RequestHandler;
  driverPaymentQr: RequestHandler;
  driverPaymentStatus: RequestHandler;
  checkoutPage: RequestHandler;
  checkoutSession: RequestHandler;
  checkoutVerify: RequestHandler;
  checkoutStatus: RequestHandler;
  disputePayment: RequestHandler;
  resolvePaymentDispute: RequestHandler;
  listPaymentDisputes: RequestHandler;
  cancelRide: RequestHandler;
}

export function buildRidesRouter(deps: RidesRouterDeps): Router {
  const router = Router();
  const participantGuard = deps.requireParticipant ?? deps.requireCanCancel;
  const disputeReadGuard = deps.requireDisputeReadAdmin ?? deps.requireDisputeAdmin;

  router.post('/payment/upi/webhook', deps.upiWebhook);
  // Payment-only QR tickets never grant account or ride-management access.
  router.get('/payment/upi/checkout', deps.checkoutPage);
  router.post('/payment/upi/checkout/session', deps.checkoutSession);
  router.post('/payment/upi/checkout/verify', deps.checkoutVerify);
  router.post('/payment/upi/checkout/status', deps.checkoutStatus);
  router.use(deps.authenticate);

  // Rider / Admin / Driver static collection routes (must precede /:id)
  router.post('/', deps.requireRider, deps.createRide);
  router.get('/payment/disputes', disputeReadGuard, deps.listPaymentDisputes);
  router.get('/driver/earnings', deps.requireDriver, deps.driverEarnings);
  router.get('/driver/history', deps.requireDriver, deps.driverHistory);
  router.post(
    '/admin/reconcile-earnings',
    deps.requireFinanceAdmin,
    deps.reconcileDriverEarnings,
  );

  // Rider / driver / admin
  router.get('/', deps.requireCanRead, deps.listRides);
  router.get('/:id', deps.requireCanRead, deps.getRide);
  router.get('/:id/events', deps.requireCanRead, deps.getRideEvents);
  router.post('/:id/cancel', deps.requireCanCancel, deps.cancelRide);

  // Driver / Rider participants
  router.post('/:id/accept', deps.requireDriver, deps.acceptRide);
  router.post('/:id/counter', deps.requireDriver, deps.driverCounter);
  router.post('/:id/counter/respond', deps.requireRider, deps.respondCounter);
  router.post('/:id/fare/raise', deps.requireRider, deps.raiseFare);
  router.post('/:id/en-route', deps.requireDriver, deps.driverEnRoute);
  router.post('/:id/arrived', deps.requireDriver, deps.driverArrived);
  router.post('/:id/start', deps.requireDriver, deps.startRide);
  router.post('/:id/complete', deps.requireDriver, deps.completeRide);
  router.post('/:id/payment/confirm', deps.requireDriver, deps.confirmPayment);
  router.post('/:id/payment/cash', participantGuard, deps.switchToCash);
  router.post('/:id/payment/upi', deps.requireRider, deps.createUpiPayment);
  router.post('/:id/payment/upi/session', deps.requireRider, deps.upiSession);
  router.post('/:id/payment/upi/verify', deps.requireRider, deps.verifyUpiPayment);
  router.get('/:id/payment/upi/status', deps.requireRider, deps.upiPaymentStatus);
  router.post('/:id/payment/upi/qr', deps.requireDriver, deps.driverPaymentQr);
  router.get('/:id/payment/upi/driver-status', deps.requireDriver, deps.driverPaymentStatus);
  router.post('/:id/payment/dispute', deps.requireRider, deps.disputePayment);
  router.post('/:id/payment/dispute/resolve', deps.requireDisputeAdmin, deps.resolvePaymentDispute);

  return router;
}
