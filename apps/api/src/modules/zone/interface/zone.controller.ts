import type { Request, RequestHandler, Response } from 'express';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import type {
  ActivateZoneUseCase,
  CreateZoneUseCase,
  DeactivateZoneUseCase,
  DeleteZoneUseCase,
  GetZoneDependentsUseCase,
  GetZoneHistoryUseCase,
  GetZoneUseCase,
  ListZonesUseCase,
  ResolveZonesUseCase,
  UpdateZoneGeometryUseCase,
  UpdateZoneUseCase,
  ValidateZoneUseCase,
} from '../application/useCases/index.js';
import {
  createZoneSchema,
  deactivateZoneSchema,
  listZonesQuerySchema,
  resolveZonesRequestSchema,
  updateZoneGeometrySchema,
  updateZoneSchema,
  validateZoneSchema,
  zoneIdParamSchema,
} from './zone.validation.js';

export function makeCreateZoneController(useCase: CreateZoneUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const parsed = createZoneSchema.parse(req.body);
    const actorId = req.auth?.userId ?? 'system';
    const result = await useCase.execute(parsed, actorId);
    sendSuccess(req, res, result, 'Zone created successfully', 201);
  });
}

export function makeValidateZoneController(useCase: ValidateZoneUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const parsed = validateZoneSchema.parse(req.body);
    const result = await useCase.execute(parsed);
    sendSuccess(req, res, result, 'Zone validation completed', 200);
  });
}

export function makeUpdateZoneController(useCase: UpdateZoneUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = zoneIdParamSchema.parse(req.params);
    const parsed = updateZoneSchema.parse(req.body);
    const actorId = req.auth?.userId ?? 'system';
    const result = await useCase.execute(id, parsed, actorId);
    sendSuccess(req, res, result, 'Zone updated successfully', 200);
  });
}

export function makeUpdateZoneGeometryController(
  useCase: UpdateZoneGeometryUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = zoneIdParamSchema.parse(req.params);
    const parsed = updateZoneGeometrySchema.parse(req.body);
    const actorId = req.auth?.userId ?? 'system';
    const result = await useCase.execute(id, parsed, actorId);
    sendSuccess(req, res, result, 'Zone geometry updated successfully', 200);
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
    if (filter.page !== undefined || filter.limit !== undefined) {
      const result = await useCase.executePaginated(filter);
      sendSuccess(req, res, result, 'Zones retrieved successfully', 200);
    } else {
      const result = await useCase.execute(filter);
      sendSuccess(req, res, result, 'Zones retrieved successfully', 200);
    }
  });
}

export function makeActivateZoneController(useCase: ActivateZoneUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = zoneIdParamSchema.parse(req.params);
    const actorId = req.auth?.userId ?? 'system';
    const result = await useCase.execute(id, actorId);
    sendSuccess(req, res, result, 'Zone activated successfully', 200);
  });
}

export function makeDeactivateZoneController(useCase: DeactivateZoneUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = zoneIdParamSchema.parse(req.params);
    const { reason } = deactivateZoneSchema.parse(req.body);
    const actorId = req.auth?.userId ?? 'system';
    const result = await useCase.execute(id, actorId, reason);
    sendSuccess(req, res, result, 'Zone deactivated successfully', 200);
  });
}

export function makeGetZoneHistoryController(useCase: GetZoneHistoryUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = zoneIdParamSchema.parse(req.params);
    const result = await useCase.execute(id);
    sendSuccess(req, res, result, 'Zone history retrieved successfully', 200);
  });
}

export function makeGetZoneDependentsController(useCase: GetZoneDependentsUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = zoneIdParamSchema.parse(req.params);
    const result = await useCase.execute(id);
    sendSuccess(req, res, result, 'Zone dependents retrieved successfully', 200);
  });
}

export function makeResolveZonesController(useCase: ResolveZonesUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const parsed = resolveZonesRequestSchema.parse(req.body);
    const result = await useCase.execute(parsed);
    sendSuccess(req, res, result, 'Zones resolved successfully', 200);
  });
}

export function makeDeleteZoneController(useCase: DeleteZoneUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = zoneIdParamSchema.parse(req.params);
    const actorId = req.auth?.userId ?? 'system';
    await useCase.execute(id, actorId);
    sendSuccess(req, res, { id }, 'Zone deleted successfully', 200);
  });
}
