import type { RequestHandler, Router } from 'express';
import {
  AssertServiceableUseCase,
  ImportStateBoundariesUseCase,
  ManageStateUseCase,
  ResolveRouteStatesUseCase,
  ResolveStateForPointUseCase,
  VerifyQuoteStateUseCase,
} from './application/useCases/index.js';
import type { StateBoundaryRepositoryPort } from './domain/index.js';
import { ActiveBoundaryCache, MongoStateBoundaryRepository } from './infrastructure/index.js';
import {
  makeGetStateController,
  makeImportStatesController,
  makeListStatesController,
  makeSetStateStatusController,
  makeStateHistoryController,
  makeUpdateStateController,
} from './interface/stateBoundary.controller.js';
import { buildAdminStateRouter } from './interface/stateBoundary.routes.js';

export interface StateBoundaryContainer {
  stateBoundaryRepo: StateBoundaryRepositoryPort;
  resolveStateForPointUseCase: ResolveStateForPointUseCase;
  assertServiceableUseCase: AssertServiceableUseCase;
  importStateBoundariesUseCase: ImportStateBoundariesUseCase;
  verifyQuoteStateUseCase: VerifyQuoteStateUseCase;
  manageStateUseCase: ManageStateUseCase;
  resolveRouteStatesUseCase: ResolveRouteStatesUseCase;
  buildAdminStateRouter: (deps: {
    authenticate: RequestHandler;
    requireAdminRole: RequestHandler;
    requireSuperAdmin: RequestHandler;
  }) => Router;
}

export function buildStateBoundaryContainer(deps?: {
  stateBoundaryRepo?: StateBoundaryRepositoryPort | undefined;
}): StateBoundaryContainer {
  const stateBoundaryRepo = deps?.stateBoundaryRepo ?? new MongoStateBoundaryRepository();
  const resolveStateForPointUseCase = new ResolveStateForPointUseCase(stateBoundaryRepo);
  const importStateBoundariesUseCase = new ImportStateBoundariesUseCase(stateBoundaryRepo);
  const manageStateUseCase = new ManageStateUseCase(stateBoundaryRepo);
  const activeBoundaryCache = new ActiveBoundaryCache(stateBoundaryRepo);
  const resolveRouteStatesUseCase = new ResolveRouteStatesUseCase(activeBoundaryCache);
  const listStates = makeListStatesController(stateBoundaryRepo);
  const importStates = makeImportStatesController(importStateBoundariesUseCase);

  return {
    stateBoundaryRepo,
    resolveStateForPointUseCase,
    assertServiceableUseCase: new AssertServiceableUseCase(resolveStateForPointUseCase),
    importStateBoundariesUseCase,
    verifyQuoteStateUseCase: new VerifyQuoteStateUseCase(stateBoundaryRepo),
    manageStateUseCase,
    resolveRouteStatesUseCase,
    buildAdminStateRouter: (authDeps) =>
      buildAdminStateRouter({
        ...authDeps,
        listStates,
        importStates,
        getState: makeGetStateController(manageStateUseCase),
        updateState: makeUpdateStateController(manageStateUseCase),
        activateState: makeSetStateStatusController(manageStateUseCase, 'ACTIVE'),
        deactivateState: makeSetStateStatusController(manageStateUseCase, 'INACTIVE'),
        stateHistory: makeStateHistoryController(manageStateUseCase),
      }),
  };
}
