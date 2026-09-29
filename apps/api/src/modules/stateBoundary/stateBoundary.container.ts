import type { Router, RequestHandler } from 'express';
import {
  AssertServiceableUseCase,
  ImportStateBoundariesUseCase,
  ResolveStateForPointUseCase,
} from './application/useCases/index.js';
import type { StateBoundaryRepositoryPort } from './domain/index.js';
import { MongoStateBoundaryRepository } from './infrastructure/index.js';
import {
  makeImportStatesController,
  makeListStatesController,
} from './interface/stateBoundary.controller.js';
import { buildAdminStateRouter } from './interface/stateBoundary.routes.js';

export interface StateBoundaryContainer {
  stateBoundaryRepo: StateBoundaryRepositoryPort;
  resolveStateForPointUseCase: ResolveStateForPointUseCase;
  assertServiceableUseCase: AssertServiceableUseCase;
  importStateBoundariesUseCase: ImportStateBoundariesUseCase;
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
  const listStates = makeListStatesController(stateBoundaryRepo);
  const importStates = makeImportStatesController(importStateBoundariesUseCase);

  return {
    stateBoundaryRepo,
    resolveStateForPointUseCase,
    assertServiceableUseCase: new AssertServiceableUseCase(resolveStateForPointUseCase),
    importStateBoundariesUseCase,
    buildAdminStateRouter: (authDeps) =>
      buildAdminStateRouter({ ...authDeps, listStates, importStates }),
  };
}
