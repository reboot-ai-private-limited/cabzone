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
  config?: Partial<DispatchConfig> | undefined;
}

export interface DispatchContainer {
  presence: DriverPresencePort;
  /** Plug into the rides container so ride state changes reach clients in realtime. */
  notifier: RideRealtimeNotifier;
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

  const notifier = new RideRealtimeNotifier(
    deps.publisher,
    findCandidates,
    deps.lookups,
    deps.rideRepo,
  );
  const setStatus = new SetDriverStatusUseCase(deps.presence, deps.lookups);
  const updateLocation = new UpdateDriverLocationUseCase(deps.presence, deps.lookups, notifier);
  const listDriverOffersUseCase = new ListDriverOffersUseCase(
    deps.presence,
    deps.rideRepo,
    eligibility,
    deps.lookups,
    config,
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
    listDriverOffersUseCase,
    listFleetDriversUseCase,
    simulateFleetUseCase,
    buildDispatchRouter: (auth) =>
      buildDispatchRouter({
        authenticate: auth.authenticate,
        requireDriver: auth.requireRole('DRIVER'),
        setStatus: makeSetStatusController(setStatus),
        updateLocation: makeUpdateLocationController(updateLocation),
        listOffers: makeListOffersController(listDriverOffersUseCase),
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
