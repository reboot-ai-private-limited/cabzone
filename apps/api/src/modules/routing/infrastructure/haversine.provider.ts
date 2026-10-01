import { haversineDistanceM } from '@cabzone/geo';
import type { RouteProviderPort, RouteRequest, RouteResult } from '../domain/index.js';

/**
 * Dev/test-only route provider that estimates distance using straight-line haversine
 * scaled by a 1.3 road curvature factor and average speed of ~30 km/h (8.33 m/s).
 * Strictly forbidden in live production environments.
 */
export class HaversineRouteProvider implements RouteProviderPort {
  readonly name = 'HAVERSINE_ESTIMATE' as const;

  async calculateRoute(req: RouteRequest): Promise<RouteResult> {
    const directM = haversineDistanceM(req.origin, req.destination);
    const distanceM = Math.max(100, Math.round(directM * 1.3));
    const durationS = Math.max(30, Math.round(distanceM / 8.33));

    return {
      provider: 'HAVERSINE_ESTIMATE',
      distanceM,
      durationS,
      polyline: null,
    };
  }
}

