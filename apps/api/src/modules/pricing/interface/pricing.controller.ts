import type { Request, RequestHandler, Response } from 'express';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import type {
  ActivatePricingConfigUseCase,
  CreatePricingConfigUseCase,
  CreateQuoteUseCase,
  CreateStatePricingUseCase,
  DeletePricingConfigUseCase,
  ListPricingConfigsUseCase,
  ListStatePricingUseCase,
  UpdatePricingConfigUseCase,
} from '../application/useCases/index.js';
import {
  createPricingConfigSchema,
  createStatePricingSchema,
  listPricingConfigsSchema,
  listStatePricingSchema,
  updatePricingConfigSchema,
} from './pricing.validation.js';

export function makeCreatePricingConfigController(
  useCase: CreatePricingConfigUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const parsed = createPricingConfigSchema.parse(req.body);
    const actorId = req.auth?.userId ?? parsed.createdByAdminId ?? 'system';
    const result = await useCase.execute(parsed, actorId);
    sendSuccess(req, res, result, 'Pricing config created successfully', 201);
  });
}

export function makeListPricingConfigsController(
  useCase: ListPricingConfigsUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = listPricingConfigsSchema.parse(req.query);
    const result = await useCase.execute(query);
    sendSuccess(req, res, result, 'Pricing configs retrieved successfully', 200);
  });
}

export function makeUpdatePricingConfigController(
  useCase: UpdatePricingConfigUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const parsed = updatePricingConfigSchema.parse(req.body);
    const result = await useCase.execute(id, parsed);
    sendSuccess(req, res, result, 'Pricing config updated successfully', 200);
  });
}

export function makeDeletePricingConfigController(
  useCase: DeletePricingConfigUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await useCase.execute(id);
    sendSuccess(req, res, { id }, 'Pricing config deleted successfully', 200);
  });
}

export function makeActivatePricingConfigController(
  useCase: ActivatePricingConfigUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const result = await useCase.execute(id);
    sendSuccess(req, res, result, 'Pricing config activated successfully', 200);
  });
}

export function makeCreateStatePricingController(
  useCase: CreateStatePricingUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const parsed = createStatePricingSchema.parse(req.body);
    const result = await useCase.execute(parsed);
    sendSuccess(req, res, result, 'State pricing created successfully', 201);
  });
}

export function makeListStatePricingController(
  useCase: ListStatePricingUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = listStatePricingSchema.parse(req.query);
    const result = await useCase.execute(query.status);
    sendSuccess(req, res, result, 'State pricing retrieved successfully', 200);
  });
}

export function makeCreateQuoteController(
  useCase: CreateQuoteUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const result = await useCase.execute(req.body);
    sendSuccess(req, res, result, 'Quote created successfully', 200);
  });
}
