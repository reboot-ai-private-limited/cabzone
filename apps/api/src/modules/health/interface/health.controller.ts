import type { RequestHandler } from 'express';
import { sendSuccess } from '@/shared/http/response.util.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import type { GetHealthUseCase } from '../application/useCases/getHealth.usecase.js';

export function makeGetHealthController(useCase: GetHealthUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const report = await useCase.execute();
    sendSuccess(req, res, report, 'Health check', report.status === 'healthy' ? 200 : 503);
  });
}
