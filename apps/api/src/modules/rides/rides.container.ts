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
  makeDriverEnRouteController,
  makeGetRideController,
  makeListRidesController,
  makeRideEventsController,
  makeStartRideController,
  type RideHttpContext,
} from './interface/rides.controller.js';
import { buildRidesRouter } from './interface/rides.routes.js';

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

  const createRideUseCase = new CreateRideUseCase({
    unitOfWork: deps.unitOfWork,
    rideEventRepo,
    rideRepo,
    pricingConfigRepo: deps.pricingConfigRepo,
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
    notifier: deps.notifier,
    pickupOtpSecret: deps.pickupOtpSecret,
  };

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
        requireCanCancel: auth.requireRole('RIDER', 'DRIVER'),
        createRide: makeCreateRideController(createRideUseCase, actors),
        listRides: makeListRidesController(rideRepo, actors),
        getRide: makeGetRideController(rideRepo, actors),
        getRideEvents: makeRideEventsController(rideRepo, rideEventRepo, actors),
        acceptRide: makeAcceptRideController(acceptRideUseCase, actors),
        driverEnRoute: makeDriverEnRouteController(driverEnRouteUseCase, actors),
        driverArrived: makeDriverArrivedController(driverArrivedUseCase, actors),
        startRide: makeStartRideController(startRideUseCase, actors),
        completeRide: makeCompleteRideController(completeRideUseCase, actors),
        confirmPayment: makeCompleteRideController(completeRideUseCase, actors, true),
        disputePayment: makeDisputePaymentController(completeRideUseCase, actors),
        resolvePaymentDispute: makeResolvePaymentDisputeController(completeRideUseCase, actors),
        listPaymentDisputes: makeListPaymentDisputesController(rideRepo, rideEventRepo),
        cancelRide: makeCancelRideController(cancelRideUseCase, actors),
      }),
  };
}
