import type { RequestHandler, Router } from 'express';
import type { AuthRole } from '@cabzone/contracts';
import type { RealtimePublisherPort } from '../../shared/realtime/realtime.port.js';
import type { WalletRepositoryPort } from '../ledger/ledger.public.js';
import type { RideRepositoryPort } from '../rides/rides.public.js';
import {
  DEFAULT_DISPATCH_CONFIG,
  type DispatchConfig,
  type DispatchLookups,
} from './application/dispatch.types.js';
import { RideRealtimeNotifier } from './application/rideRealtimeNotifier.js';
import { ExpoPushService } from './application/expoPush.service.js';
import type { OfferRecipientsPort } from './application/offerRecipients.port.js';
import { MemoryOfferRecipientsRepository } from './infrastructure/offerRecipients.repository.js';
import type { PushTokenPort } from './application/pushToken.port.js';
import type { PushReceiptPort } from './application/pushReceipt.port.js';
import { MemoryPushTokenRepository } from './infrastructure/pushToken.repository.js';
import { MemoryPushReceiptRepository } from './infrastructure/pushReceipt.repository.js';
import { DriverOfferEligibility } from './application/useCases/driverOfferEligibility.js';
import { FindCandidateDriversUseCase } from './application/useCases/findCandidateDrivers.usecase.js';
import { ListDriverOffersUseCase } from './application/useCases/listDriverOffers.usecase.js';
import { SetDriverStatusUseCase } from './application/useCases/setDriverStatus.usecase.js';
import { UpdateDriverLocationUseCase } from './application/useCases/updateDriverLocation.usecase.js';
import type { DriverPresencePort } from './domain/presence.port.js';
import { ListFleetDriversUseCase } from './application/useCases/listFleetDrivers.usecase.js';
import { SimulateFleetUseCase } from './application/useCases/simulateFleet.usecase.js';
import {
  makeListOffersController,
  makeGetStatusController,
  makeRegisterPushTokenController,
  makeUnregisterPushTokenController,
  makeSetStatusController,
  makeUpdateLocationController,
} from './interface/dispatch.controller.js';
import {
  makeListFleetController,
  makeSimulateFleetController,
} from './interface/adminDispatch.controller.js';
import { buildDispatchRouter } from './interface/dispatch.routes.js';
import { buildAdminDispatchRouter } from './interface/adminDispatch.routes.js';

export interface DispatchContainerDeps {
  presence: DriverPresencePort;
  publisher: RealtimePublisherPort;
  rideRepo: RideRepositoryPort;
  walletRepo: WalletRepositoryPort;
  lookups: DispatchLookups;
  offerRecipients?: OfferRecipientsPort;
  pushTokens?: PushTokenPort;
  pushReceipts?: PushReceiptPort;
  config?: Partial<DispatchConfig> | undefined;
  isDevMode?: boolean | undefined;
}

export interface DispatchContainer {
  presence: DriverPresencePort;
  /** Plug into the rides container so ride state changes reach clients in realtime. */
  notifier: RideRealtimeNotifier;
  push: ExpoPushService;
  listDriverOffersUseCase: ListDriverOffersUseCase;
  listFleetDriversUseCase: ListFleetDriversUseCase;
  simulateFleetUseCase: SimulateFleetUseCase;
  buildDispatchRouter: (auth: {
    authenticate: RequestHandler;
    requireRole: (...roles: AuthRole[]) => RequestHandler;
  }) => Router;
  buildAdminDispatchRouter: (auth: {
    authenticate: RequestHandler;
    requireRole: (...roles: AuthRole[]) => RequestHandler;
  }) => Router;
}

export function buildDispatchContainer(deps: DispatchContainerDeps): DispatchContainer {
  const config: DispatchConfig = { ...DEFAULT_DISPATCH_CONFIG, ...deps.config };
  const eligibility = new DriverOfferEligibility(deps.walletRepo, deps.rideRepo);
  const findCandidates = new FindCandidateDriversUseCase(deps.presence, eligibility, config);

  const push = new ExpoPushService(
    deps.pushTokens ?? new MemoryPushTokenRepository(),
    deps.pushReceipts ?? new MemoryPushReceiptRepository(),
  );
  const notifier = new RideRealtimeNotifier(
    deps.publisher,
    findCandidates,
    deps.lookups,
    deps.rideRepo,
    push,
    deps.offerRecipients ?? new MemoryOfferRecipientsRepository(),
  );
  const setStatus = new SetDriverStatusUseCase(deps.presence, deps.lookups);
  const updateLocation = new UpdateDriverLocationUseCase(deps.presence, deps.lookups, notifier);
  const listDriverOffersUseCase = new ListDriverOffersUseCase(
    deps.presence,
    deps.rideRepo,
    eligibility,
    deps.lookups,
    config,
    Boolean(deps.isDevMode),
  );

  const listFleetDriversUseCase = new ListFleetDriversUseCase(
    deps.presence,
    deps.rideRepo,
    deps.lookups,
  );
  const simulateFleetUseCase = new SimulateFleetUseCase(deps.presence);

  return {
    presence: deps.presence,
    notifier,
    push,
    listDriverOffersUseCase,
    listFleetDriversUseCase,
    simulateFleetUseCase,
    buildDispatchRouter: (auth) =>
      buildDispatchRouter({
        authenticate: auth.authenticate,
        requireDriver: auth.requireRole('DRIVER'),
        setStatus: makeSetStatusController(setStatus),
        getStatus: makeGetStatusController(setStatus),
        updateLocation: makeUpdateLocationController(updateLocation),
        listOffers: makeListOffersController(listDriverOffersUseCase),
        registerPushToken: makeRegisterPushTokenController(push),
        unregisterPushToken: makeUnregisterPushTokenController(push),
      }),
    buildAdminDispatchRouter: (auth) =>
      buildAdminDispatchRouter({
        authenticate: auth.authenticate,
        requireAdminRole: auth.requireRole('SUPER_ADMIN', 'CITY_ADMIN', 'SUPPORT_ADMIN'),
        listFleet: makeListFleetController(listFleetDriversUseCase),
        simulateFleet: makeSimulateFleetController(simulateFleetUseCase),
      }),
  };
}
