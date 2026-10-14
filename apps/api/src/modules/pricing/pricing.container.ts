import type { RequestHandler, Router } from 'express';
import type { UnitOfWorkPort } from '../../shared/db/unitOfWork.port.js';
import type { ServiceClassificationUseCase } from '../zone/zone.public.js';
import type { RouteRequest, RouteResult } from '../routing/routing.public.js';
import {
  ActivatePricingConfigUseCase,
  CreatePricingConfigUseCase,
  CreateQuoteUseCase,
  DeletePricingConfigUseCase,
  ListPricingConfigsUseCase,
  UpdatePricingConfigUseCase,
} from './application/useCases/index.js';
import type { PricingConfigRepositoryPort } from './domain/index.js';
import {
  makeActivatePricingConfigController,
  makeCreatePricingConfigController,
  makeCreateQuoteController,
  makeDeletePricingConfigController,
  makeListPricingConfigsController,
  makeUpdatePricingConfigController,
} from './interface/pricing.controller.js';
import { buildAdminPricingRouter, buildPricingRouter } from './interface/pricing.routes.js';

export interface PricingContainerDeps {
  unitOfWork: UnitOfWorkPort;
  pricingConfigRepo: PricingConfigRepositoryPort;
  serviceClassificationUseCase: ServiceClassificationUseCase;
  tokenSecret: string;
  quoteTtlSeconds?: number | undefined;
  routingUseCase?: { execute(req: RouteRequest): Promise<RouteResult> } | undefined;
}

export interface PricingContainer {
  pricingConfigRepo: PricingConfigRepositoryPort;
  createPricingConfigUseCase: CreatePricingConfigUseCase;
  updatePricingConfigUseCase: UpdatePricingConfigUseCase;
  deletePricingConfigUseCase: DeletePricingConfigUseCase;
  activatePricingConfigUseCase: ActivatePricingConfigUseCase;
  listPricingConfigsUseCase: ListPricingConfigsUseCase;
  createQuoteUseCase: CreateQuoteUseCase;
  buildAdminPricingRouter: (auth?: {
    authenticate?: RequestHandler | undefined;
    requireAdminRole?: RequestHandler | undefined;
  }) => Router;
  buildPricingRouter: () => Router;
}

export function buildPricingContainer(deps: PricingContainerDeps): PricingContainer {
  const createPricingConfigUseCase = new CreatePricingConfigUseCase(
    deps.pricingConfigRepo,
    deps.unitOfWork,
  );
  const updatePricingConfigUseCase = new UpdatePricingConfigUseCase(
    deps.pricingConfigRepo,
    deps.unitOfWork,
  );
  const deletePricingConfigUseCase = new DeletePricingConfigUseCase(deps.pricingConfigRepo);
  const activatePricingConfigUseCase = new ActivatePricingConfigUseCase(
    deps.pricingConfigRepo,
    deps.unitOfWork,
  );
  const listPricingConfigsUseCase = new ListPricingConfigsUseCase(deps.pricingConfigRepo);
  const createQuoteUseCase = new CreateQuoteUseCase({
    serviceClassificationUseCase: deps.serviceClassificationUseCase,
    pricingConfigRepo: deps.pricingConfigRepo,
    routingUseCase: deps.routingUseCase,
    tokenSecret: deps.tokenSecret,
    quoteTtlSeconds: deps.quoteTtlSeconds,
  });

  return {
    pricingConfigRepo: deps.pricingConfigRepo,
    createPricingConfigUseCase,
    updatePricingConfigUseCase,
    deletePricingConfigUseCase,
    activatePricingConfigUseCase,
    listPricingConfigsUseCase,
    createQuoteUseCase,
    buildAdminPricingRouter: (auth) =>
      buildAdminPricingRouter({
        authenticate: auth?.authenticate,
        requireAdminRole: auth?.requireAdminRole,
        createPricingConfig: makeCreatePricingConfigController(createPricingConfigUseCase),
        listPricingConfigs: makeListPricingConfigsController(listPricingConfigsUseCase),
        updatePricingConfig: makeUpdatePricingConfigController(updatePricingConfigUseCase),
        deletePricingConfig: makeDeletePricingConfigController(deletePricingConfigUseCase),
        activatePricingConfig: makeActivatePricingConfigController(activatePricingConfigUseCase),
      }),
    buildPricingRouter: () =>
      buildPricingRouter({
        createQuote: makeCreateQuoteController(createQuoteUseCase),
      }),
  };
}
