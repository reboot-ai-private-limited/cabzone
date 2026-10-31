import { Router, type RequestHandler } from 'express';

export interface RidesRouterDeps {
  getCommunication: RequestHandler;
  listMessages: RequestHandler;
  sendMessage: RequestHandler;
  currentCall?: RequestHandler;
  startCall?: RequestHandler;
  answerCall?: RequestHandler;
  declineCall?: RequestHandler;
  endCall?: RequestHandler;
  callToken?: RequestHandler;
  confirmCallConnected?: RequestHandler;
  endCurrentCall?: RequestHandler;
  callWebhook?: RequestHandler;
  proposeExtension?: RequestHandler;
  respondExtension?: RequestHandler;
  authenticate: RequestHandler;
  requireRider: RequestHandler;
  requireDriver: RequestHandler;
  requireCanCancel: RequestHandler;
  requireParticipant?: RequestHandler | undefined;
  requireCanRead: RequestHandler;
  requireDisputeAdmin: RequestHandler;
  requireWaiverAdmin: RequestHandler;
  requireDisputeReadAdmin?: RequestHandler | undefined;
  requireFinanceAdmin: RequestHandler;
  createRide: RequestHandler;
  listRides: RequestHandler;
  driverEarnings: RequestHandler;
  driverHistory: RequestHandler;
  reconcileDriverEarnings: RequestHandler;
  getRide: RequestHandler;
  getRideEvents: RequestHandler;
  getRideRating: RequestHandler;
  submitRideRating: RequestHandler;
  acceptRide: RequestHandler;
  driverCounter: RequestHandler;
  raiseFare: RequestHandler;
  respondCounter: RequestHandler;
  driverEnRoute: RequestHandler;
  driverArrived: RequestHandler;
  startRide: RequestHandler;
  completeRide: RequestHandler;
  confirmPayment: RequestHandler;
  claimCashPaid?: RequestHandler;
  markRideUnpaid?: RequestHandler;
  createUpiPayment: RequestHandler;
  upiSession: RequestHandler;
  switchToCash: RequestHandler;
  upiWebhook: RequestHandler;
  verifyUpiPayment: RequestHandler;
  upiPaymentStatus: RequestHandler;
  driverPaymentQr: RequestHandler;
  driverPaymentStatus: RequestHandler;
  driverCreatePaymentQr?: RequestHandler;
  driverPollPaymentQr?: RequestHandler;
  checkoutPage: RequestHandler;
  checkoutSession: RequestHandler;
  checkoutVerify: RequestHandler;
  checkoutStatus: RequestHandler;
  disputePayment: RequestHandler;
  resolvePaymentDispute: RequestHandler;
  listPaymentDisputes: RequestHandler;
  cancelRide: RequestHandler;
  waiveCancellationFee: RequestHandler;
}

export function buildRidesRouter(deps: RidesRouterDeps): Router {
  const router = Router();
  const participantGuard = deps.requireParticipant ?? deps.requireCanCancel;
  const disputeReadGuard = deps.requireDisputeReadAdmin ?? deps.requireDisputeAdmin;

  router.post('/payment/upi/webhook', deps.upiWebhook);
  if (deps.callWebhook) router.post('/calls/webhook', deps.callWebhook);
  // Payment-only QR tickets never grant account or ride-management access.
  router.get('/payment/upi/checkout', deps.checkoutPage);
  router.post('/payment/upi/checkout/session', deps.checkoutSession);
  router.post('/payment/upi/checkout/verify', deps.checkoutVerify);
  router.post('/payment/upi/checkout/status', deps.checkoutStatus);
  router.use(deps.authenticate);
  if (deps.endCurrentCall) router.post('/calls/current/end', deps.endCurrentCall);

  // Rider / Admin / Driver static collection routes (must precede /:id)
  router.post('/', deps.requireRider, deps.createRide);
  router.get('/payment/disputes', disputeReadGuard, deps.listPaymentDisputes);
  router.get('/driver/earnings', deps.requireDriver, deps.driverEarnings);
  router.get('/driver/history', deps.requireDriver, deps.driverHistory);
  router.post('/admin/reconcile-earnings', deps.requireFinanceAdmin, deps.reconcileDriverEarnings);

  // Rider / driver / admin
  router.get('/', deps.requireCanRead, deps.listRides);
  router.get('/:id', deps.requireCanRead, deps.getRide);
  router.get('/:id/communication', deps.getCommunication);
  router.get('/:id/messages', deps.listMessages);
  router.post('/:id/messages', deps.sendMessage);
  if (deps.currentCall) router.get('/:id/calls/current', deps.currentCall);
  if (deps.startCall) router.post('/:id/calls', deps.startCall);
  if (deps.answerCall) router.post('/:id/calls/:callId/answer', deps.answerCall);
  if (deps.declineCall) router.post('/:id/calls/:callId/decline', deps.declineCall);
  if (deps.endCall) router.post('/:id/calls/:callId/end', deps.endCall);
  if (deps.callToken) router.post('/:id/calls/:callId/token', deps.callToken);
  if (deps.confirmCallConnected) router.post('/:id/calls/:callId/connected', deps.confirmCallConnected);
  router.get('/:id/events', deps.requireCanRead, deps.getRideEvents);
  router.get('/:id/rating', deps.requireCanRead, deps.getRideRating);
  router.post('/:id/rating', deps.requireCanCancel, deps.submitRideRating);
  if (deps.proposeExtension)
    router.post('/:id/extensions', deps.requireRider, deps.proposeExtension);
  if (deps.respondExtension)
    router.post('/:id/extensions/:extensionId/respond', deps.requireDriver, deps.respondExtension);
  router.post('/:id/cancel', deps.requireCanCancel, deps.cancelRide);
  router.post('/:id/cancellation-fee/waive', deps.requireWaiverAdmin, deps.waiveCancellationFee);

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
  if (deps.claimCashPaid) {
    router.post('/:id/payment/claim-cash', deps.requireRider, deps.claimCashPaid);
  }
  if (deps.markRideUnpaid) {
    router.post('/:id/payment/unpaid', deps.requireDriver, deps.markRideUnpaid);
  }
  router.post('/:id/payment/cash', participantGuard, deps.switchToCash);
  router.post('/:id/payment/upi', deps.requireRider, deps.createUpiPayment);
  router.post('/:id/payment/upi/session', deps.requireRider, deps.upiSession);
  router.post('/:id/payment/upi/verify', deps.requireRider, deps.verifyUpiPayment);
  router.get('/:id/payment/upi/status', deps.requireRider, deps.upiPaymentStatus);
  router.post('/:id/payment/upi/qr', deps.requireDriver, deps.driverPaymentQr);
  router.get('/:id/payment/upi/driver-status', deps.requireDriver, deps.driverPaymentStatus);
  if (deps.driverCreatePaymentQr) {
    router.post('/:id/payment-qr', deps.requireDriver, deps.driverCreatePaymentQr);
  }
  if (deps.driverPollPaymentQr) {
    router.get('/:id/payment-qr', deps.requireDriver, deps.driverPollPaymentQr);
  }
  router.post('/:id/payment/dispute', deps.requireRider, deps.disputePayment);
  router.post('/:id/payment/dispute/resolve', deps.requireDisputeAdmin, deps.resolvePaymentDispute);

  return router;
}
