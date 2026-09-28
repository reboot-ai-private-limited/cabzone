export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * GeoJSON position is [longitude, latitude].
 */
export type Position = [lng: number, lat: number];

export interface GeoJsonPoint {
  type: 'Point';
  coordinates: Position;
}

export function toPosition(point: GeoPoint): Position {
  return [point.lng, point.lat];
}

export function fromPosition(pos: Position | [number, number]): GeoPoint {
  return {
    lng: pos[0],
    lat: pos[1],
  };
}

export function toGeoJsonPoint(point: GeoPoint): GeoJsonPoint {
  return {
    type: 'Point',
    coordinates: toPosition(point),
  };
}

export function isValidLatitude(lat: number): boolean {
  return typeof lat === 'number' && !Number.isNaN(lat) && Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function isValidLongitude(lng: number): boolean {
  return typeof lng === 'number' && !Number.isNaN(lng) && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

export interface CoordinateValidationResult {
  valid: boolean;
  error?: string;
  appearsSwapped?: boolean;
}

export function validateCoordinates(point: { lat: number; lng: number }): CoordinateValidationResult {
  if (typeof point.lat !== 'number' || Number.isNaN(point.lat) || !Number.isFinite(point.lat)) {
    return { valid: false, error: 'Latitude must be a finite number.' };
  }
  if (typeof point.lng !== 'number' || Number.isNaN(point.lng) || !Number.isFinite(point.lng)) {
    return { valid: false, error: 'Longitude must be a finite number.' };
  }

  // Detect coordinate swap:
  // 1. Math impossibility: latitude > 90 (e.g. lat = 95.5, lng = 26.7)
  if (Math.abs(point.lat) > 90 && Math.abs(point.lng) <= 90) {
    return {
      valid: false,
      error: `Latitude ${point.lat} is out of bounds [-90, 90]. Coordinates appear to be swapped with longitude.`,
      appearsSwapped: true,
    };
  }

  // 2. Indian subcontinent coordinate swap heuristic:
  // In India, lat is ~8° to 37° N, and lng is ~68° to 98° E.
  // If lat is in [60, 100] and lng is in [5, 40], axes are inverted ([lng, lat] entered as [lat, lng]).
  if (point.lat >= 60 && point.lat <= 100 && point.lng >= 5 && point.lng <= 40) {
    return {
      valid: false,
      error: `Coordinates appear swapped: latitude ${point.lat} and longitude ${point.lng} resemble inverted Indian subcontinent coordinates.`,
      appearsSwapped: true,
    };
  }

  if (point.lat < -90 || point.lat > 90) {
    return { valid: false, error: `Latitude ${point.lat} must be between -90 and 90.` };
  }
  if (point.lng < -180 || point.lng > 180) {
    return { valid: false, error: `Longitude ${point.lng} must be between -180 and 180.` };
  }

  return { valid: true };
}

const EARTH_RADIUS_METERS = 6_371_000;

export function haversineDistanceM(p1: GeoPoint, p2: GeoPoint): number {
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const lat1 = (p1.lat * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_METERS * c);
}

export function midpoint(p1: GeoPoint, p2: GeoPoint): GeoPoint {
  return {
    lat: (p1.lat + p2.lat) / 2,
    lng: (p1.lng + p2.lng) / 2,
  };
}
