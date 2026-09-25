import type { RequestHandler, Router } from 'express';
import {
  CreateZoneUseCase,
  GetZoneUseCase,
  ListZonesUseCase,
  ResolveZonesUseCase,
  UpdateZoneUseCase,
} from './application/useCases/index.js';
import type { ZoneRepositoryPort } from './domain/index.js';
import { MongoZoneRepository } from './infrastructure/persistence/index.js';
import {
  makeCreateZoneController,
  makeGetZoneController,
  makeListZonesController,
  makeResolveZonesController,
  makeUpdateZoneController,
} from './interface/zone.controller.js';
import { buildAdminZoneRouter, buildZoneRouter } from './interface/zone.routes.js';

export interface ZoneContainer {
  createZoneUseCase: CreateZoneUseCase;
  updateZoneUseCase: UpdateZoneUseCase;
  getZoneUseCase: GetZoneUseCase;
  listZonesUseCase: ListZonesUseCase;
  resolveZonesUseCase: ResolveZonesUseCase;
  zoneRepo: ZoneRepositoryPort;
  buildAdminZoneRouter: (deps: { authenticate: RequestHandler; requireAdminRole: RequestHandler }) => Router;
  buildZoneRouter: () => Router;
}

export interface ZoneContainerDeps {
  zoneRepo?: ZoneRepositoryPort | undefined;
  globalDefaultBufferM?: number | undefined;
}

export function buildZoneContainer(deps?: ZoneContainerDeps): ZoneContainer {
  const zoneRepo = deps?.zoneRepo ?? new MongoZoneRepository();

  const createZoneUseCase = new CreateZoneUseCase({ zoneRepo });
  const updateZoneUseCase = new UpdateZoneUseCase({ zoneRepo });
  const getZoneUseCase = new GetZoneUseCase({ zoneRepo });
  const listZonesUseCase = new ListZonesUseCase({ zoneRepo });
  const resolveZonesUseCase = new ResolveZonesUseCase({
    zoneRepo,
    globalDefaultBufferM: deps?.globalDefaultBufferM,
  });

  const createZone = makeCreateZoneController(createZoneUseCase);
  const updateZone = makeUpdateZoneController(updateZoneUseCase);
  const getZone = makeGetZoneController(getZoneUseCase);
  const listZones = makeListZonesController(listZonesUseCase);
  const resolveZones = makeResolveZonesController(resolveZonesUseCase);

  return {
    createZoneUseCase,
    updateZoneUseCase,
    getZoneUseCase,
    listZonesUseCase,
    resolveZonesUseCase,
    zoneRepo,
    buildAdminZoneRouter: (authDeps) =>
      buildAdminZoneRouter({
        ...authDeps,
        createZone,
        updateZone,
        getZone,
        listZones,
      }),
    buildZoneRouter: () =>
      buildZoneRouter({
        resolveZones,
      }),
  };
}
