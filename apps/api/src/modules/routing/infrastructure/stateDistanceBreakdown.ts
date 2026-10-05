import type { GeoPoint } from '@cabzone/geo';
import { decodePolyline, haversineDistanceM } from '@cabzone/geo';
import type { StateDistanceBreakdown } from '@cabzone/contracts';
import { getStateNameFromCode } from './indiaStateCodes.js';
import { OfflineIndiaGeoResolver } from './offlineGeoResolver.js';

export interface StateDistanceBreakdownInput {
  origin: GeoPoint;
  destination: GeoPoint;
  totalDistanceM: number;
  polyline?: string | null | undefined;
  geoResolver?: OfflineIndiaGeoResolver | undefined;
}

/**
 * Accurately calculates the distance traversed within each state/territory along a driving route.
 * Works seamlessly with Google Routes polylines as well as interpolated trajectory coordinates.
 * Guaranteed to normalize so the sum of segment distances equals the official route total.
 */
export function calculateStateDistanceBreakdown(
  input: StateDistanceBreakdownInput,
): StateDistanceBreakdown[] {
  const { origin, destination, totalDistanceM, polyline } = input;
  const resolver = input.geoResolver ?? new OfflineIndiaGeoResolver();

  if (totalDistanceM <= 0) {
    return [];
  }

  let points: GeoPoint[] = [];

  if (polyline && polyline.trim().length > 0) {
    try {
      const decoded = decodePolyline(polyline);
      if (decoded.length >= 2) {
        points = decoded.map(([lng, lat]) => ({ lat, lng }));
      }
    } catch {
      // Fall back to trajectory interpolation below
    }
  }

  // If polyline missing or degenerate, interpolate 50 sample points along the direct route path
  if (points.length < 2) {
    const steps = 50;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      points.push({
        lat: origin.lat + (destination.lat - origin.lat) * t,
        lng: origin.lng + (destination.lng - origin.lng) * t,
      });
    }
  }

  const stateDistances = new Map<string, { stateName: string; rawMeters: number }>();
  let totalRawM = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const distM = haversineDistanceM(p1, p2);
    if (distM <= 0) continue;

    const midPoint: GeoPoint = {
      lat: (p1.lat + p2.lat) / 2,
      lng: (p1.lng + p2.lng) / 2,
    };

    const loc = resolver.resolveLocationSync(midPoint);
    const code = loc.stateCode ?? 'IN';
    const name = loc.state ?? getStateNameFromCode(code) ?? 'India';

    const current = stateDistances.get(code);
    if (current) {
      current.rawMeters += distM;
    } else {
      stateDistances.set(code, { stateName: name, rawMeters: distM });
    }
    totalRawM += distM;
  }

  if (stateDistances.size === 0 || totalRawM <= 0) {
    const originLoc = resolver.resolveLocationSync(origin);
    const code = originLoc.stateCode ?? 'IN';
    const name = originLoc.state ?? getStateNameFromCode(code) ?? 'India';
    return [
      {
        stateCode: code,
        stateName: name,
        distanceM: totalDistanceM,
        distanceKm: Math.round((totalDistanceM / 1000) * 10) / 10,
        percentage: 100,
      },
    ];
  }

  // Scale raw distances to exactly match totalDistanceM
  const scale = totalDistanceM / totalRawM;
  const result: StateDistanceBreakdown[] = [];
  let allocatedM = 0;

  for (const [stateCode, entry] of stateDistances.entries()) {
    const scaledM = Math.round(entry.rawMeters * scale);
    allocatedM += scaledM;
    result.push({
      stateCode,
      stateName: entry.stateName,
      distanceM: scaledM,
      distanceKm: Math.round((scaledM / 1000) * 10) / 10,
      percentage: Math.round(((entry.rawMeters * scale) / totalDistanceM) * 1000) / 10,
    });
  }

  // Adjust rounding difference to the largest segment
  const diffM = totalDistanceM - allocatedM;
  if (diffM !== 0 && result.length > 0) {
    result.sort((a, b) => b.distanceM - a.distanceM);
    result[0]!.distanceM += diffM;
    result[0]!.distanceKm = Math.round((result[0]!.distanceM / 1000) * 10) / 10;
  }

  // Sort descending by distance
  result.sort((a, b) => b.distanceM - a.distanceM);

  // Recalculate clean percentages
  for (const item of result) {
    item.percentage = Math.round((item.distanceM / totalDistanceM) * 1000) / 10;
  }

  return result;
}
