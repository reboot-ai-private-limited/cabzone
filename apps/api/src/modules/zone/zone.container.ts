import type { RequestHandler, Router } from 'express';
import {
  ActivateZoneUseCase,
  CreateZoneUseCase,
  DeactivateZoneUseCase,
  GetZoneHistoryUseCase,
  GetZoneUseCase,
  ListZonesUseCase,
  ResolveZonesUseCase,
  UpdateZoneGeometryUseCase,
  UpdateZoneMetadataUseCase,
  UpdateZoneUseCase,
  ValidateZoneUseCase,
} from './application/useCases/index.js';
import type { ZoneAuditRepositoryPort, ZoneRepositoryPort } from './domain/index.js';
import {
  MemoryZoneAuditRepository,
  MemoryZoneRepository,
  MongoZoneAuditRepository,
  MongoZoneRepository,
} from './infrastructure/persistence/index.js';
import {
  makeActivateZoneController,
  makeCreateZoneController,
  makeDeactivateZoneController,
  makeGetZoneController,
  makeGetZoneHistoryController,
  makeListZonesController,
  makeResolveZonesController,
  makeUpdateZoneController,
  makeUpdateZoneGeometryController,
  makeValidateZoneController,
} from './interface/zone.controller.js';
import { buildAdminZoneRouter, buildZoneRouter } from './interface/zone.routes.js';
import { registerZoneSwaggerPaths } from './interface/zone.swagger.js';

export interface ZoneContainer {
  createZoneUseCase: CreateZoneUseCase;
  validateZoneUseCase: ValidateZoneUseCase;
  updateZoneUseCase: UpdateZoneUseCase;
  updateZoneMetadataUseCase: UpdateZoneMetadataUseCase;
  updateZoneGeometryUseCase: UpdateZoneGeometryUseCase;
  getZoneUseCase: GetZoneUseCase;
  listZonesUseCase: ListZonesUseCase;
  activateZoneUseCase: ActivateZoneUseCase;
  deactivateZoneUseCase: DeactivateZoneUseCase;
  getZoneHistoryUseCase: GetZoneHistoryUseCase;
  resolveZonesUseCase: ResolveZonesUseCase;
  zoneRepo: ZoneRepositoryPort;
  auditRepo: ZoneAuditRepositoryPort;
  buildAdminZoneRouter: (deps: { authenticate: RequestHandler; requireAdminRole: RequestHandler }) => Router;
  buildZoneRouter: () => Router;
}

export interface ZoneContainerDeps {
  zoneRepo?: ZoneRepositoryPort | undefined;
  auditRepo?: ZoneAuditRepositoryPort | undefined;
  globalDefaultBufferM?: number | undefined;
}

export function buildZoneContainer(deps?: ZoneContainerDeps): ZoneContainer {
  registerZoneSwaggerPaths();
  const zoneRepo = deps?.zoneRepo ?? new MongoZoneRepository();
  const auditRepo =
    deps?.auditRepo ??
    (deps?.zoneRepo instanceof MemoryZoneRepository
      ? new MemoryZoneAuditRepository()
      : new MongoZoneAuditRepository());

  const validateZoneUseCase = new ValidateZoneUseCase({ zoneRepo });
  const createZoneUseCase = new CreateZoneUseCase({ zoneRepo, auditRepo, validateZoneUseCase });
  const updateZoneUseCase = new UpdateZoneUseCase({ zoneRepo, auditRepo });
  const updateZoneMetadataUseCase = new UpdateZoneMetadataUseCase({ zoneRepo, auditRepo });
  const updateZoneGeometryUseCase = new UpdateZoneGeometryUseCase({
    zoneRepo,
    auditRepo,
    validateZoneUseCase,
  });
  const getZoneUseCase = new GetZoneUseCase({ zoneRepo });
  const listZonesUseCase = new ListZonesUseCase({ zoneRepo });
  const activateZoneUseCase = new ActivateZoneUseCase({ zoneRepo, auditRepo });
  const deactivateZoneUseCase = new DeactivateZoneUseCase({ zoneRepo, auditRepo });
  const getZoneHistoryUseCase = new GetZoneHistoryUseCase({ zoneRepo, auditRepo });
  const resolveZonesUseCase = new ResolveZonesUseCase({
    zoneRepo,
    globalDefaultBufferM: deps?.globalDefaultBufferM,
  });

  const createZone = makeCreateZoneController(createZoneUseCase);
  const validateZone = makeValidateZoneController(validateZoneUseCase);
  const updateZone = makeUpdateZoneController(updateZoneUseCase);
  const updateZoneGeometry = makeUpdateZoneGeometryController(updateZoneGeometryUseCase);
  const getZone = makeGetZoneController(getZoneUseCase);
  const listZones = makeListZonesController(listZonesUseCase);
  const activateZone = makeActivateZoneController(activateZoneUseCase);
  const deactivateZone = makeDeactivateZoneController(deactivateZoneUseCase);
  const getZoneHistory = makeGetZoneHistoryController(getZoneHistoryUseCase);
  const resolveZones = makeResolveZonesController(resolveZonesUseCase);

  return {
    createZoneUseCase,
    validateZoneUseCase,
    updateZoneUseCase,
    updateZoneMetadataUseCase,
    updateZoneGeometryUseCase,
    getZoneUseCase,
    listZonesUseCase,
    activateZoneUseCase,
    deactivateZoneUseCase,
    getZoneHistoryUseCase,
    resolveZonesUseCase,
    zoneRepo,
    auditRepo,
    buildAdminZoneRouter: (authDeps) =>
      buildAdminZoneRouter({
        ...authDeps,
        createZone,
        validateZone,
        updateZone,
        updateZoneGeometry,
        getZone,
        listZones,
        activateZone,
        deactivateZone,
        getZoneHistory,
      }),
    buildZoneRouter: () =>
      buildZoneRouter({
        resolveZones,
      }),
  };
}
