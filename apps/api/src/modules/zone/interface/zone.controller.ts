import type { Request, RequestHandler, Response } from 'express';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import type {
  CreateZoneUseCase,
  GetZoneUseCase,
  ListZonesUseCase,
  ResolveZonesUseCase,
  UpdateZoneUseCase,
} from '../application/useCases/index.js';
import {
  createZoneSchema,
  listZonesQuerySchema,
  resolveZonesRequestSchema,
  updateZoneSchema,
  zoneIdParamSchema,
} from './zone.validation.js';

export function makeCreateZoneController(useCase: CreateZoneUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const parsed = createZoneSchema.parse(req.body);
    const result = await useCase.execute(parsed);
    sendSuccess(req, res, result, 'Zone created successfully', 201);
  });
}

export function makeUpdateZoneController(useCase: UpdateZoneUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = zoneIdParamSchema.parse(req.params);
    const parsed = updateZoneSchema.parse(req.body);
    const result = await useCase.execute(id, parsed);
    sendSuccess(req, res, result, 'Zone updated successfully', 200);
  });
}

export function makeGetZoneController(useCase: GetZoneUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = zoneIdParamSchema.parse(req.params);
    const result = await useCase.execute(id);
    sendSuccess(req, res, result, 'Zone retrieved successfully', 200);
  });
}

export function makeListZonesController(useCase: ListZonesUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const filter = listZonesQuerySchema.parse(req.query);
    const result = await useCase.execute(filter);
    sendSuccess(req, res, result, 'Zones retrieved successfully', 200);
  });
}

export function makeResolveZonesController(useCase: ResolveZonesUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const parsed = resolveZonesRequestSchema.parse(req.body);
    const result = await useCase.execute(parsed);
    sendSuccess(req, res, result, 'Zones resolved successfully', 200);
  });
}
