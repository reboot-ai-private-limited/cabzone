import { decodePolyline, segmentRouteByStates } from '@cabzone/geo';
import type { RouteStateSegmentDto } from '@cabzone/contracts';
import type { ActiveStateBoundaryProviderPort } from '../../domain/index.js';

export class ResolveRouteStatesUseCase {
  constructor(private readonly boundaryProvider: ActiveStateBoundaryProviderPort) {}

  async execute(polyline: string | null | undefined): Promise<RouteStateSegmentDto[]> {
    if (!polyline || polyline.trim() === '') {
      return [];
    }

    const points = decodePolyline(polyline);
    if (points.length < 2) {
      return [];
    }

    const activeStates = await this.boundaryProvider.getActive();
    const regions = activeStates.map((s) => ({
      code: s.stateCode,
      geometry: s.geometry,
    }));

    return segmentRouteByStates(points, regions);
  }
}

