import type { RequestHandler, Router } from 'express';
import type { AuthRole } from '@cabzone/contracts';
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
  RideNotifierPort,
  RideRepositoryPort,
} from './domain/index.js';
import { ExpireOffersUseCase } from './application/useCases/expireOffers.usecase.js';
import {
  makeAcceptRideController,
  makeCancelRideController,
  makeCompleteRideController,
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
  rideRepo: RideRepositoryPort;
  rideEventRepo: RideEventRepositoryPort;
  walletRepo: WalletRepositoryPort;
  pricingConfigRepo: PricingConfigRepositoryPort;
  tokenSecret: string;
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
    rideRepo,
    pricingConfigRepo: deps.pricingConfigRepo,
    tokenSecret: deps.tokenSecret,
  });
  const acceptRideUseCase = new AcceptRideUseCase({ rideRepo, walletRepo, otpSecret: deps.pickupOtpSecret });
  const driverEnRouteUseCase = new DriverEnRouteUseCase({ rideRepo, rideEventRepo });
  const driverArrivedUseCase = new DriverArrivedUseCase({ rideRepo, rideEventRepo });
  const startRideUseCase = new StartRideUseCase({ rideRepo });
  const completeRideUseCase = new CompleteRideUseCase({ rideRepo, walletRepo, rideEventRepo });
  const cancelRideUseCase = new CancelRideUseCase({ rideRepo, walletRepo, rideEventRepo });

  const expireOffersUseCase = new ExpireOffersUseCase({
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
        requireRider: auth.requireRole('RIDER', ...ADMIN_ROLES),
        requireDriver: auth.requireRole('DRIVER', ...ADMIN_ROLES),
        requireCanRead: auth.requireRole('RIDER', 'DRIVER', ...ADMIN_ROLES),
        requireCanCancel: auth.requireRole('RIDER', 'DRIVER', ...ADMIN_ROLES),
        createRide: makeCreateRideController(createRideUseCase, actors),
        listRides: makeListRidesController(rideRepo, actors),
        getRide: makeGetRideController(rideRepo, actors),
        getRideEvents: makeRideEventsController(rideRepo, rideEventRepo, actors),
        acceptRide: makeAcceptRideController(acceptRideUseCase, actors),
        driverEnRoute: makeDriverEnRouteController(driverEnRouteUseCase, actors),
        driverArrived: makeDriverArrivedController(driverArrivedUseCase, actors),
        startRide: makeStartRideController(startRideUseCase, actors),
        completeRide: makeCompleteRideController(completeRideUseCase, actors),
        cancelRide: makeCancelRideController(cancelRideUseCase, actors),
      }),
  };
}
