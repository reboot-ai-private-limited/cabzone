import type { RequestHandler, Router } from 'express';
import {
  ActivateZoneUseCase,
  CreateZoneUseCase,
  DeactivateZoneUseCase,
  DeleteZoneUseCase,
  type DestinationStateResolver,
  GetZoneDependentsUseCase,
  GetZoneHistoryUseCase,
  GetZoneUseCase,
  ListZonesUseCase,
  ResolveZonesUseCase,
  ServiceClassificationUseCase,
  UpdateZoneGeometryUseCase,
  UpdateZoneMetadataUseCase,
  UpdateZoneUseCase,
  ValidateZoneUseCase,
} from './application/useCases/index.js';
import type {
  CoverageRequestRepositoryPort,
  ZoneAuditRepositoryPort,
  ZoneRepositoryPort,
} from './domain/index.js';
import {
  MemoryCoverageRequestRepository,
  MemoryZoneAuditRepository,
  MemoryZoneRepository,
  MongoCoverageRequestRepository,
  MongoZoneAuditRepository,
  MongoZoneRepository,
} from './infrastructure/persistence/index.js';
import {
  makeActivateZoneController,
  makeCreateZoneController,
  makeDeactivateZoneController,
  makeDeleteZoneController,
  makeGetZoneController,
  makeGetZoneDependentsController,
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
  deleteZoneUseCase: DeleteZoneUseCase;
  getZoneHistoryUseCase: GetZoneHistoryUseCase;
  getZoneDependentsUseCase: GetZoneDependentsUseCase;
  resolveZonesUseCase: ResolveZonesUseCase;
  serviceClassificationUseCase: ServiceClassificationUseCase;
  zoneRepo: ZoneRepositoryPort;
  auditRepo: ZoneAuditRepositoryPort;
  coverageRepo?: CoverageRequestRepositoryPort | undefined;
  buildAdminZoneRouter: (deps: { authenticate: RequestHandler; requireAdminRole: RequestHandler }) => Router;
  buildZoneRouter: () => Router;
}

export interface ZoneContainerDeps {
  zoneRepo?: ZoneRepositoryPort | undefined;
  auditRepo?: ZoneAuditRepositoryPort | undefined;
  coverageRepo?: CoverageRequestRepositoryPort | undefined;
  globalDefaultBufferM?: number | undefined;
  destinationStateResolver?: DestinationStateResolver | undefined;
}

export function buildZoneContainer(deps?: ZoneContainerDeps): ZoneContainer {
  registerZoneSwaggerPaths();
  const zoneRepo = deps?.zoneRepo ?? new MongoZoneRepository();
  const auditRepo =
    deps?.auditRepo ??
    (deps?.zoneRepo instanceof MemoryZoneRepository
      ? new MemoryZoneAuditRepository()
      : new MongoZoneAuditRepository());
  const coverageRepo =
    deps?.coverageRepo ??
    (deps?.zoneRepo instanceof MemoryZoneRepository
      ? new MemoryCoverageRequestRepository()
      : new MongoCoverageRequestRepository());

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
  const deleteZoneUseCase = new DeleteZoneUseCase({ zoneRepo, auditRepo });
  const getZoneHistoryUseCase = new GetZoneHistoryUseCase({ zoneRepo, auditRepo });
  const getZoneDependentsUseCase = new GetZoneDependentsUseCase({ zoneRepo });
  const resolveZonesUseCase = new ResolveZonesUseCase({
    zoneRepo,
    coverageRepo,
    globalDefaultBufferM: deps?.globalDefaultBufferM,
  });
  const serviceClassificationUseCase = new ServiceClassificationUseCase({
    resolveZonesUseCase,
    globalDefaultBufferM: deps?.globalDefaultBufferM,
    destinationStateResolver: deps?.destinationStateResolver,
  });

  const createZone = makeCreateZoneController(createZoneUseCase);
  const validateZone = makeValidateZoneController(validateZoneUseCase);
  const updateZone = makeUpdateZoneController(updateZoneUseCase);
  const updateZoneGeometry = makeUpdateZoneGeometryController(updateZoneGeometryUseCase);
  const getZone = makeGetZoneController(getZoneUseCase);
  const listZones = makeListZonesController(listZonesUseCase);
  const activateZone = makeActivateZoneController(activateZoneUseCase);
  const deactivateZone = makeDeactivateZoneController(deactivateZoneUseCase);
  const deleteZone = makeDeleteZoneController(deleteZoneUseCase);
  const getZoneHistory = makeGetZoneHistoryController(getZoneHistoryUseCase);
  const getZoneDependents = makeGetZoneDependentsController(getZoneDependentsUseCase);
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
    deleteZoneUseCase,
    getZoneHistoryUseCase,
    getZoneDependentsUseCase,
    resolveZonesUseCase,
    serviceClassificationUseCase,
    zoneRepo,
    auditRepo,
    coverageRepo,
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
        deleteZone,
        getZoneHistory,
        getZoneDependents,
      }),
    buildZoneRouter: () =>
      buildZoneRouter({
        resolveZones,
      }),
  };
}
