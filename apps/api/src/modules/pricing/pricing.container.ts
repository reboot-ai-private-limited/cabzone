import type { RequestHandler, Router } from 'express';
import type { ServiceClassificationUseCase } from '../zone/zone.public.js';
import type { RouteStateSegmentDto } from '@cabzone/contracts';
import type { RouteRequest, RouteResult } from '../routing/routing.public.js';
import {
  ActivatePricingConfigUseCase,
  CreatePricingConfigUseCase,
  CreateQuoteUseCase,
  CreateStatePricingUseCase,
  DeletePricingConfigUseCase,
  ListPricingConfigsUseCase,
  ListStatePricingUseCase,
  UpdatePricingConfigUseCase,
} from './application/useCases/index.js';
import type {
  PricingConfigRepositoryPort,
  StatePricingRepositoryPort,
} from './domain/index.js';
import {
  makeActivatePricingConfigController,
  makeCreatePricingConfigController,
  makeCreateQuoteController,
  makeCreateStatePricingController,
  makeDeletePricingConfigController,
  makeListPricingConfigsController,
  makeListStatePricingController,
  makeUpdatePricingConfigController,
} from './interface/pricing.controller.js';
import {
  buildAdminPricingRouter,
  buildPricingRouter,
} from './interface/pricing.routes.js';

export interface PricingContainerDeps {
  pricingConfigRepo: PricingConfigRepositoryPort;
  statePricingRepo: StatePricingRepositoryPort;
  serviceClassificationUseCase: ServiceClassificationUseCase;
  tokenSecret: string;
  quoteTtlSeconds?: number | undefined;
  routingUseCase?: { execute(req: RouteRequest): Promise<RouteResult> } | undefined;
  resolveRouteStatesUseCase?: {
    execute(polyline: string | null | undefined): Promise<RouteStateSegmentDto[]>;
  } | undefined;
}

export interface PricingContainer {
  pricingConfigRepo: PricingConfigRepositoryPort;
  statePricingRepo: StatePricingRepositoryPort;
  createPricingConfigUseCase: CreatePricingConfigUseCase;
  updatePricingConfigUseCase: UpdatePricingConfigUseCase;
  deletePricingConfigUseCase: DeletePricingConfigUseCase;
  activatePricingConfigUseCase: ActivatePricingConfigUseCase;
  listPricingConfigsUseCase: ListPricingConfigsUseCase;
  createStatePricingUseCase: CreateStatePricingUseCase;
  listStatePricingUseCase: ListStatePricingUseCase;
  createQuoteUseCase: CreateQuoteUseCase;
  buildAdminPricingRouter: (auth?: {
    authenticate?: RequestHandler | undefined;
    requireAdminRole?: RequestHandler | undefined;
  }) => Router;
  buildPricingRouter: () => Router;
}

export function buildPricingContainer(deps: PricingContainerDeps): PricingContainer {
  const createPricingConfigUseCase = new CreatePricingConfigUseCase(deps.pricingConfigRepo);
  const updatePricingConfigUseCase = new UpdatePricingConfigUseCase(deps.pricingConfigRepo);
  const deletePricingConfigUseCase = new DeletePricingConfigUseCase(deps.pricingConfigRepo);
  const activatePricingConfigUseCase = new ActivatePricingConfigUseCase(deps.pricingConfigRepo);
  const listPricingConfigsUseCase = new ListPricingConfigsUseCase(deps.pricingConfigRepo);
  const createStatePricingUseCase = new CreateStatePricingUseCase(deps.statePricingRepo);
  const listStatePricingUseCase = new ListStatePricingUseCase(deps.statePricingRepo);
  const createQuoteUseCase = new CreateQuoteUseCase({
    serviceClassificationUseCase: deps.serviceClassificationUseCase,
    pricingConfigRepo: deps.pricingConfigRepo,
    statePricingRepo: deps.statePricingRepo,
    routingUseCase: deps.routingUseCase,
    resolveRouteStatesUseCase: deps.resolveRouteStatesUseCase,
    tokenSecret: deps.tokenSecret,
    quoteTtlSeconds: deps.quoteTtlSeconds,
  });

  return {
    pricingConfigRepo: deps.pricingConfigRepo,
    statePricingRepo: deps.statePricingRepo,
    createPricingConfigUseCase,
    updatePricingConfigUseCase,
    deletePricingConfigUseCase,
    activatePricingConfigUseCase,
    listPricingConfigsUseCase,
    createStatePricingUseCase,
    listStatePricingUseCase,
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
        createStatePricing: makeCreateStatePricingController(createStatePricingUseCase),
        listStatePricing: makeListStatePricingController(listStatePricingUseCase),
      }),
    buildPricingRouter: () =>
      buildPricingRouter({
        createQuote: makeCreateQuoteController(createQuoteUseCase),
      }),
  };
}
