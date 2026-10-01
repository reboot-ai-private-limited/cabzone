import type { Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import { datasetVersionFromGeoJson, featuresFromGeoJson } from '../application/geojsonFeatures.js';
import type {
  ImportStateBoundariesUseCase,
  ManageStateUseCase,
} from '../application/useCases/index.js';
import type { StateBoundaryRepositoryPort } from '../domain/index.js';

const importBodySchema = z.object({
  geojson: z.object({ type: z.enum(['FeatureCollection', 'Feature']) }).passthrough(),
  source: z.string().trim().min(1).max(120).optional(),
  sourceVersion: z.string().trim().max(60).nullish(),
});

export function makeListStatesController(repo: StateBoundaryRepositoryPort): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const includeInactive = req.query['includeInactive'] === 'true';
    const states = includeInactive ? await repo.listAll() : await repo.listActive();
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
      // An explicit value wins; otherwise take the version stated in the file itself.
      sourceVersion: body.sourceVersion ?? datasetVersionFromGeoJson(body.geojson),
    });
    sendSuccess(req, res, result, 'State boundaries imported', 200);
  });
}

const updateBodySchema = z
  .object({
    stateName: z.string().trim().min(1).max(120).optional(),
    intrastateEnabled: z.boolean().optional(),
    interstateDropOffEnabled: z.boolean().optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .refine(
    (b) =>
      b.stateName !== undefined ||
      b.intrastateEnabled !== undefined ||
      b.interstateDropOffEnabled !== undefined,
    { message: 'Nothing to update.' },
  );

const versionOnlySchema = z.object({ expectedVersion: z.number().int().positive().optional() });

/** Optimistic concurrency: `If-Match-Version` header (per the LLD), or `expectedVersion` in body. */
function expectedVersionOf(req: Request, fromBody: number | undefined): number {
  const header = req.header('if-match-version');
  const value = header !== undefined ? Number(header) : fromBody;
  if (value === undefined || !Number.isInteger(value) || value < 1) {
    throw AppError.badRequest('If-Match-Version header (or expectedVersion) is required.');
  }
  return value;
}

const codeOf = (req: Request): string => String(req.params['stateCode'] ?? '');

export function makeGetStateController(useCase: ManageStateUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(req, res, { state: await useCase.get(codeOf(req)) }, 'State retrieved', 200);
  });
}

export function makeUpdateStateController(useCase: ManageStateUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const body = updateBodySchema.parse(req.body);
    const state = await useCase.update({
      stateCode: codeOf(req),
      expectedVersion: expectedVersionOf(req, body.expectedVersion),
      stateName: body.stateName,
      intrastateEnabled: body.intrastateEnabled,
      interstateDropOffEnabled: body.interstateDropOffEnabled,
    });
    sendSuccess(req, res, { state }, 'State updated', 200);
  });
}

export function makeSetStateStatusController(
  useCase: ManageStateUseCase,
  status: 'ACTIVE' | 'INACTIVE',
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const body = versionOnlySchema.parse(req.body ?? {});
    const state = await useCase.setStatus(
      codeOf(req),
      expectedVersionOf(req, body.expectedVersion),
      status,
    );
    sendSuccess(req, res, { state }, 'State status updated', 200);
  });
}

export function makeStateHistoryController(useCase: ManageStateUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(req, res, { history: await useCase.history(codeOf(req)) }, 'State history', 200);
  });
}
