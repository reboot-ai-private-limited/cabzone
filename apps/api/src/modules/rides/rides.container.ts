import type { RequestHandler, Router } from 'express';
import type { AuthRole } from '@cabzone/contracts';
import type { UnitOfWorkPort } from '../../shared/db/unitOfWork.port.js';
import type { WalletRepositoryPort } from '../ledger/ledger.public.js';
import type { PricingConfigRepositoryPort } from '../pricing/pricing.public.js';
import { AcceptRideUseCase } from './application/useCases/acceptRide.usecase.js';
import { CancelRideUseCase } from './application/useCases/cancelRide.usecase.js';
import { CompleteRideUseCase } from './application/useCases/completeRide.usecase.js';
import { CreateRideUseCase } from './application/useCases/createRide.usecase.js';
import { DriverArrivedUseCase } from './application/useCases/driverArrived.usecase.js';
import { DriverEnRouteUseCase } from './application/useCases/driverEnRoute.usecase.js';
import { StartRideUseCase } from './application/useCases/startRide.usecase.js';
import { NegotiateFareUseCase } from './application/useCases/negotiateFare.usecase.js';
import type {
  RideEventRepositoryPort,
  RideEntity,
  RideNotifierPort,
  RideRepositoryPort,
} from './domain/index.js';
import { ExpireOffersUseCase } from './application/useCases/expireOffers.usecase.js';
import {
  makeAcceptRideController,
  makeCancelRideController,
  makeCompleteRideController,
  makeDisputePaymentController,
  makeResolvePaymentDisputeController,
  makeListPaymentDisputesController,
  makeCreateRideController,
  makeDriverArrivedController,
  makeDriverCounterController,
  makeRespondCounterController,
  makeRaiseFareController,
  makeDriverEnRouteController,
  makeGetRideController,
  makeListRidesController,
  makeRideEventsController,
  makeStartRideController,
  makeWaiveCancellationFeeController,
  type RideHttpContext,
} from './interface/rides.controller.js';
import { buildRidesRouter } from './interface/rides.routes.js';
import { RideUpiPaymentUseCase } from './application/useCases/rideUpiPayment.usecase.js';
import {
  makeRideUpiController,
  makeSwitchToCashController,
} from './interface/rideUpiPayment.controller.js';
import { makeRideUpiWebhook } from './interface/rideUpiWebhook.controller.js';
import { RazorpayGateway } from './infrastructure/razorpay.adapter.js';
import { env, isProduction } from '../../config/env.js';
import { RidePaymentQrAdapter } from './infrastructure/ridePaymentQr.adapter.js';
import { makeRidePaymentQrControllers } from './interface/ridePaymentQr.controller.js';

export interface RidesContainerDeps extends RideHttpContext {
  unitOfWork: UnitOfWorkPort;
  rideRepo: RideRepositoryPort;
  rideEventRepo: RideEventRepositoryPort;
  walletRepo: WalletRepositoryPort;
  pricingConfigRepo: PricingConfigRepositoryPort;
  tokenSecret: string;
  requireDriverEligibility: (driverId: string, ride: RideEntity) => Promise<string>;
  notifier?: RideNotifierPort | undefined;
  /** Secret used to derive rider-visible pickup OTPs. */
  pickupOtpSecret?: string | undefined;
}

export interface RidesContainerAuth {
  authenticate: RequestHandler;
  requireRole: (...roles: AuthRole[]) => RequestHandler;
}

export interface RidesContainer {
  rideRepo: RideRepositoryPort;
  createRideUseCase: CreateRideUseCase;
  acceptRideUseCase: AcceptRideUseCase;
  driverEnRouteUseCase: DriverEnRouteUseCase;
  driverArrivedUseCase: DriverArrivedUseCase;
  startRideUseCase: StartRideUseCase;
  completeRideUseCase: CompleteRideUseCase;
  cancelRideUseCase: CancelRideUseCase;
  expireOffersUseCase: ExpireOffersUseCase;
  buildRidesRouter: (auth: RidesContainerAuth) => Router;
}

const ADMIN_ROLES: AuthRole[] = ['SUPER_ADMIN', 'CITY_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN'];

export function buildRidesContainer(deps: RidesContainerDeps): RidesContainer {
  const { rideRepo, rideEventRepo, walletRepo } = deps;
  const upiPayment = new RideUpiPaymentUseCase({
    walletRepo,
    rideRepo,
    rideEventRepo,
    unitOfWork: deps.unitOfWork,
    gateway: new RazorpayGateway(
      env.RAZORPAY_KEY_ID ?? '',
      env.RAZORPAY_KEY_SECRET ?? '',
      !isProduction || env.RAZORPAY_MODE === 'live',
      env.RAZORPAY_MODE,
    ),
  });

  const createRideUseCase = new CreateRideUseCase({
    unitOfWork: deps.unitOfWork,
    rideEventRepo,
    rideRepo,
    pricingConfigRepo: deps.pricingConfigRepo,
    walletRepo,
    tokenSecret: deps.tokenSecret,
  });
  const acceptRideUseCase = new AcceptRideUseCase({
    unitOfWork: deps.unitOfWork,
    rideEventRepo,
    rideRepo,
    walletRepo,
    otpSecret: deps.pickupOtpSecret,
    requireDriverEligibility: deps.requireDriverEligibility,
  });
  const negotiateFareUseCase = new NegotiateFareUseCase({
    rideRepo,
    rideEventRepo,
    unitOfWork: deps.unitOfWork,
    acceptRide: acceptRideUseCase,
    requireDriverEligibility: deps.requireDriverEligibility,
  });
  const driverEnRouteUseCase = new DriverEnRouteUseCase({
    rideRepo,
    rideEventRepo,
    unitOfWork: deps.unitOfWork,
  });
  const driverArrivedUseCase = new DriverArrivedUseCase({
    rideRepo,
    rideEventRepo,
    unitOfWork: deps.unitOfWork,
  });
  const startRideUseCase = new StartRideUseCase({
    unitOfWork: deps.unitOfWork,
    rideEventRepo,
    rideRepo,
  });
  const completeRideUseCase = new CompleteRideUseCase({
    prepareCashConfirmation: (rideId, driverId) =>
      upiPayment.prepareCashConfirmation(rideId, driverId),
    rideRepo,
    walletRepo,
    rideEventRepo,
    unitOfWork: deps.unitOfWork,
  });
  const cancelRideUseCase = new CancelRideUseCase({
    rideRepo,
    walletRepo,
    rideEventRepo,
    unitOfWork: deps.unitOfWork,
  });

  const expireOffersUseCase = new ExpireOffersUseCase({
    unitOfWork: deps.unitOfWork,
    rideRepo,
    rideEventRepo,
    notifier: deps.notifier,
  });

  const actors: RideHttpContext = {
    resolveRiderId: deps.resolveRiderId,
    resolveDriverId: deps.resolveDriverId,
    resolveAssignedDriver: deps.resolveAssignedDriver,
    notifier: deps.notifier,
    pickupOtpSecret: deps.pickupOtpSecret,
  };
  const qrControllers = makeRidePaymentQrControllers({
    rideRepo,
    payment: upiPayment,
    qr: new RidePaymentQrAdapter(deps.tokenSecret),
    actors,
  });

  return {
    rideRepo,
    createRideUseCase,
    acceptRideUseCase,
    driverEnRouteUseCase,
    driverArrivedUseCase,
    startRideUseCase,
    completeRideUseCase,
    cancelRideUseCase,
    expireOffersUseCase,
    buildRidesRouter: (auth) =>
      buildRidesRouter({
        authenticate: auth.authenticate,
        requireRider: auth.requireRole('RIDER'),
        requireDriver: auth.requireRole('DRIVER'),
        requireCanRead: auth.requireRole('RIDER', 'DRIVER', ...ADMIN_ROLES),
        requireDisputeAdmin: auth.requireRole('SUPER_ADMIN', 'SUPPORT_ADMIN'),
        requireWaiverAdmin: auth.requireRole('SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN'),
        requireCanCancel: auth.requireRole('RIDER', 'DRIVER'),
        createRide: makeCreateRideController(createRideUseCase, actors),
        listRides: makeListRidesController(rideRepo, actors),
        getRide: makeGetRideController(rideRepo, actors, rideEventRepo),
        getRideEvents: makeRideEventsController(rideRepo, rideEventRepo, actors),
        acceptRide: makeAcceptRideController(acceptRideUseCase, actors),
        driverCounter: makeDriverCounterController(negotiateFareUseCase, actors),
        respondCounter: makeRespondCounterController(negotiateFareUseCase, actors),
        raiseFare: makeRaiseFareController(negotiateFareUseCase, actors),
        driverEnRoute: makeDriverEnRouteController(driverEnRouteUseCase, actors),
        driverArrived: makeDriverArrivedController(driverArrivedUseCase, actors),
        startRide: makeStartRideController(startRideUseCase, actors),
        completeRide: makeCompleteRideController(completeRideUseCase, actors),
        confirmPayment: makeCompleteRideController(completeRideUseCase, actors, true),
        createUpiPayment: makeRideUpiController(upiPayment, actors, 'create'),
        upiSession: makeRideUpiController(upiPayment, actors, 'session'),
        switchToCash: makeSwitchToCashController(upiPayment, actors, rideRepo),
        upiWebhook: makeRideUpiWebhook(upiPayment, actors, env.RAZORPAY_WEBHOOK_SECRET),
        verifyUpiPayment: makeRideUpiController(upiPayment, actors, 'verify'),
        upiPaymentStatus: makeRideUpiController(upiPayment, actors, 'status'),
        driverPaymentQr: qrControllers.driverQr,
        driverPaymentStatus: qrControllers.driverStatus,
        checkoutPage: qrControllers.page,
        checkoutSession: qrControllers.session,
        checkoutVerify: qrControllers.verify,
        checkoutStatus: qrControllers.status,
        disputePayment: makeDisputePaymentController(completeRideUseCase, actors),
        resolvePaymentDispute: makeResolvePaymentDisputeController(completeRideUseCase, actors),
        listPaymentDisputes: makeListPaymentDisputesController(rideRepo, rideEventRepo, actors),
        cancelRide: makeCancelRideController(cancelRideUseCase, actors),
        waiveCancellationFee: makeWaiveCancellationFeeController(cancelRideUseCase, actors),
      }),
  };
}
