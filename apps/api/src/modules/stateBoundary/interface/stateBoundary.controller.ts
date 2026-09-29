import type { Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import { featuresFromGeoJson } from '../application/geojsonFeatures.js';
import type { ImportStateBoundariesUseCase } from '../application/useCases/index.js';
import type { StateBoundaryRepositoryPort } from '../domain/index.js';

const importBodySchema = z.object({
  geojson: z.object({ type: z.enum(['FeatureCollection', 'Feature']) }).passthrough(),
  source: z.string().trim().min(1).max(120).optional(),
  sourceVersion: z.string().trim().max(60).nullish(),
});

export function makeListStatesController(repo: StateBoundaryRepositoryPort): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const states = await repo.listActive();
    sendSuccess(req, res, { states }, 'State boundaries retrieved', 200);
  });
}

export function makeImportStatesController(useCase: ImportStateBoundariesUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const body = importBodySchema.parse(req.body);
    const features = featuresFromGeoJson(body.geojson);
    if (features.length === 0) {
      throw AppError.badRequest('GeoJSON contains no features to import.');
    }
    const result = await useCase.execute({
      features,
      source: body.source ?? 'ADMIN_UPLOAD',
      sourceVersion: body.sourceVersion ?? null,
    });
    sendSuccess(req, res, result, 'State boundaries imported', 200);
  });
}
