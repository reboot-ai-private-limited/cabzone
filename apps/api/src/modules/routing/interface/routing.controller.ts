import type { Request, RequestHandler, Response } from 'express';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import { AppError } from '../../../shared/errors/AppError.js';
import type { GetRouteUseCase } from '../application/getRoute.usecase.js';
import type { ResolveDestinationStateUseCase } from '../application/resolveDestinationState.usecase.js';
import type { RouteProviderPort } from '../domain/index.js';
import { env } from '../../../config/env.js';

export function makeGetRoutingHealthController(
  provider: RouteProviderPort,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(
      req,
      res,
      {
        provider: provider.name,
        configured: provider.name === 'GOOGLE_ROUTES' ? Boolean(env.GOOGLE_ROUTES_API_KEY) : true,
      },
      'Routing provider health retrieved',
    );
  });
}

export function makeGetRoutingMetricsController(
  getRouteUseCase: GetRouteUseCase,
  provider: RouteProviderPort,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const metrics = getRouteUseCase.getMetrics();
    sendSuccess(
      req,
      res,
      {
        provider: provider.name,
        ...metrics,
        averageLatencyMs:
          metrics.requests > 0 ? Math.round(metrics.totalLatencyMs / metrics.requests) : 0,
      },
      'Routing metrics retrieved',
    );
  });
}

export function makeReverseGeocodeController(
  resolveStateUseCase: ResolveDestinationStateUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (
      isNaN(lat) ||
      isNaN(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      throw AppError.badRequest(
        'Invalid coordinates: lat must be between -90 and 90, lng between -180 and 180.',
      );
    }

    const details = await resolveStateUseCase.resolveLocation({ lat, lng });
    sendSuccess(req, res, details, 'Location details retrieved successfully');
  });
}
