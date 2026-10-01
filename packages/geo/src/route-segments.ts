import { fromPosition, haversineDistanceM, type Position } from './coords.js';
import { isPointInGeometry } from './point-in-polygon.js';
import { getBoundingBox, type BoundingBox, type GeoJsonGeometry } from './polygon.js';

export interface RouteRegion {
  code: string;
  geometry: GeoJsonGeometry;
}

export interface RouteStateSegment {
  stateCode: string;
  distanceM: number;
}

interface RegionWithBBox {
  code: string;
  geometry: GeoJsonGeometry;
  bbox: BoundingBox;
}

/**
 * Pure function segmenting a polyline path across state regions.
 * Attributes each sub-segment's haversine distance to the region containing its midpoint.
 * Densifies segments longer than 2 km to accurately classify border crossings.
 * Guarantees that the sum of output segment distances equals the rounded total path distance.
 */
export function segmentRouteByStates(
  points: Position[],
  regions: RouteRegion[],
): RouteStateSegment[] {
  if (!points || points.length < 2) {
    return [];
  }

  const regionsWithBBox: RegionWithBBox[] = regions.map((r) => ({
    code: r.code,
    geometry: r.geometry,
    bbox: getBoundingBox(r.geometry),
  }));

  const rawSegments: { stateCode: string; distanceM: number }[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const segDistanceM = haversineDistanceM(fromPosition(p1), fromPosition(p2));

    if (segDistanceM <= 0) {
      continue;
    }

    const steps = Math.max(1, Math.ceil(segDistanceM / 2000));
    const subDist = segDistanceM / steps;

    for (let step = 0; step < steps; step++) {
      const t1 = step / steps;
      const t2 = (step + 1) / steps;
      const midT = (t1 + t2) / 2;

      const midLng = p1[0] + (p2[0] - p1[0]) * midT;
      const midLat = p1[1] + (p2[1] - p1[1]) * midT;
      const midPoint = { lat: midLat, lng: midLng };

      let matchedCode = 'UNKNOWN';

      for (const reg of regionsWithBBox) {
        // BBox pre-filter
        if (
          midPoint.lng >= reg.bbox.minLng &&
          midPoint.lng <= reg.bbox.maxLng &&
          midPoint.lat >= reg.bbox.minLat &&
          midPoint.lat <= reg.bbox.maxLat
        ) {
          if (isPointInGeometry(midPoint, reg.geometry)) {
            matchedCode = reg.code;
            break;
          }
        }
      }

      rawSegments.push({
        stateCode: matchedCode,
        distanceM: subDist,
      });
    }
  }

  if (rawSegments.length === 0) {
    return [];
  }

  // Merge contiguous segments with the same stateCode
  const merged: { stateCode: string; distanceM: number }[] = [];
  for (const seg of rawSegments) {
    const last = merged[merged.length - 1];
    if (last && last.stateCode === seg.stateCode) {
      last.distanceM += seg.distanceM;
    } else {
      merged.push({ stateCode: seg.stateCode, distanceM: seg.distanceM });
    }
  }

  // Round distances to integer metres while preserving exact total rounded distance
  const totalRawDistanceM = rawSegments.reduce((sum, s) => sum + s.distanceM, 0);
  const targetTotalM = Math.round(totalRawDistanceM);

  const rounded = merged.map((s) => ({
    stateCode: s.stateCode,
    distanceM: Math.round(s.distanceM),
  }));

  const currentTotal = rounded.reduce((sum, s) => sum + s.distanceM, 0);
  const diff = targetTotalM - currentTotal;

  if (diff !== 0 && rounded.length > 0) {
    let maxIdx = 0;
    for (let i = 1; i < rounded.length; i++) {
      if (rounded[i]!.distanceM > rounded[maxIdx]!.distanceM) {
        maxIdx = i;
      }
    }
    rounded[maxIdx]!.distanceM += diff;
  }

  return rounded.filter((s) => s.distanceM > 0);
}

