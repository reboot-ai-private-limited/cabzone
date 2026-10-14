import { Router, type RequestHandler } from 'express';

export interface RidesRouterDeps {
  authenticate: RequestHandler;
  requireRider: RequestHandler;
  requireDriver: RequestHandler;
  requireCanCancel: RequestHandler;
  requireCanRead: RequestHandler;
  requireDisputeAdmin: RequestHandler;
  createRide: RequestHandler;
  listRides: RequestHandler;
  getRide: RequestHandler;
  getRideEvents: RequestHandler;
  acceptRide: RequestHandler;
  driverEnRoute: RequestHandler;
  driverArrived: RequestHandler;
  startRide: RequestHandler;
  completeRide: RequestHandler;
  confirmPayment: RequestHandler;
  disputePayment: RequestHandler;
  resolvePaymentDispute: RequestHandler;
  listPaymentDisputes: RequestHandler;
  cancelRide: RequestHandler;
}

export function buildRidesRouter(deps: RidesRouterDeps): Router {
  const router = Router();
  router.use(deps.authenticate);

  // Rider
  router.post('/', deps.requireRider, deps.createRide);
  router.get('/payment/disputes', deps.requireDisputeAdmin, deps.listPaymentDisputes);

  // Rider / driver / admin
  router.get('/', deps.requireCanRead, deps.listRides);
  router.get('/:id', deps.requireCanRead, deps.getRide);
  router.get('/:id/events', deps.requireCanRead, deps.getRideEvents);
  router.post('/:id/cancel', deps.requireCanCancel, deps.cancelRide);

  // Driver
  router.post('/:id/accept', deps.requireDriver, deps.acceptRide);
  router.post('/:id/en-route', deps.requireDriver, deps.driverEnRoute);
  router.post('/:id/arrived', deps.requireDriver, deps.driverArrived);
  router.post('/:id/start', deps.requireDriver, deps.startRide);
  router.post('/:id/complete', deps.requireDriver, deps.completeRide);
  router.post('/:id/payment/confirm', deps.requireDriver, deps.confirmPayment);
  router.post('/:id/payment/dispute', deps.requireRider, deps.disputePayment);
  router.post('/:id/payment/dispute/resolve', deps.requireDisputeAdmin, deps.resolvePaymentDispute);

  return router;
}
