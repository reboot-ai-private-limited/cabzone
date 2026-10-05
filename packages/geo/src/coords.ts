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

export interface IndiaBoundaryCheckResult {
  inside: boolean;
  country?: string;
  countryCode?: string;
  reason?: string;
}

/**
 * Checks whether a given geographic coordinate is within the sovereign territory of India.
 * Detects coordinates outside India's geographic bounding box as well as coordinates falling into
 * neighbouring foreign nations (Nepal, Bhutan, Bangladesh, Pakistan, Sri Lanka, China).
 */
export function isPointInIndia(point: { lat: number; lng: number }): IndiaBoundaryCheckResult {
  const coordValid = validateCoordinates(point);
  if (!coordValid.valid) {
    return {
      inside: false,
      reason: coordValid.error ?? 'Invalid geographic coordinates.',
    };
  }

  // 1. Broad Indian Subcontinent & Islands Geographic Bounds
  // Northernmost (Siachen/Kashmir): ~37.1° N
  // Southernmost (Indira Point, Nicobar): ~6.7° N
  // Westernmost (Gujarat): ~68.1° E
  // Easternmost (Arunachal): ~97.45° E
  if (point.lat < 6.5 || point.lat > 37.2 || point.lng < 68.1 || point.lng > 97.5) {
    return {
      inside: false,
      country: 'Outside India',
      countryCode: 'XX',
      reason: `Coordinates (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}) are outside the sovereign territory of India.`,
    };
  }

  // 2. Neighbouring foreign nations within the broad bounding box:

  // Nepal: North of Bihar/UP/Bengal border
  // Biratnagar (26.48, 87.28), Kathmandu (27.72, 85.32), Pokhara (28.21, 83.99)
  if (point.lat >= 26.48 && point.lat <= 30.5 && point.lng >= 80.0 && point.lng <= 88.10) {
    return {
      inside: false,
      country: 'Nepal',
      countryCode: 'NP',
      reason: `Coordinates (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}) are located in Nepal. Cabzone operates strictly within India.`,
    };
  }

  // Bhutan: North of West Bengal/Assam border (Jaigaon is India at 26.83, Phuentsholing is Bhutan at 26.86)
  // Thimphu (27.47, 89.64), Paro (27.43, 89.42)
  if (point.lat >= 26.86 && point.lat <= 28.3 && point.lng >= 88.85 && point.lng <= 92.1) {
    return {
      inside: false,
      country: 'Bhutan',
      countryCode: 'BT',
      reason: `Coordinates (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}) are located in Bhutan. Cabzone operates strictly within India.`,
    };
  }

  // Bangladesh:
  // Central/North Bangladesh (Dhaka, Mymensingh, Bogra, Sylhet)
  if (point.lat >= 23.5 && point.lat <= 25.15 && point.lng >= 88.75 && point.lng <= 91.8) {
    return {
      inside: false,
      country: 'Bangladesh',
      countryCode: 'BD',
      reason: `Coordinates (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}) are located in Bangladesh. Cabzone operates strictly within India.`,
    };
  }

  // South Bangladesh (Chittagong, Khulna, Barisal)
  if (point.lat >= 21.5 && point.lat < 23.5 && point.lng >= 89.0 && point.lng <= 92.2) {
    return {
      inside: false,
      country: 'Bangladesh',
      countryCode: 'BD',
      reason: `Coordinates (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}) are located in Bangladesh. Cabzone operates strictly within India.`,
    };
  }

  // Tetulia / Panchagarh pocket (surrounded by North Bengal, south of lat 26.45, between lng 88.48 and 89.0)
  if (point.lat >= 26.0 && point.lat <= 26.45 && point.lng >= 88.48 && point.lng <= 89.0) {
    return {
      inside: false,
      country: 'Bangladesh',
      countryCode: 'BD',
      reason: `Coordinates (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}) are located in Bangladesh. Cabzone operates strictly within India.`,
    };
  }

  // Pakistan:
  // Punjab/Lahore (west of Wagah border at lng 74.57)
  if (point.lat >= 30.0 && point.lat <= 32.5 && point.lng < 74.5) {
    return {
      inside: false,
      country: 'Pakistan',
      countryCode: 'PK',
      reason: `Coordinates (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}) are located in Pakistan. Cabzone operates strictly within India.`,
    };
  }

  // Sindh/Balochistan (west of Rajasthan/Gujarat borders)
  if (point.lat >= 24.5 && point.lat < 30.0 && point.lng < 70.0) {
    return {
      inside: false,
      country: 'Pakistan',
      countryCode: 'PK',
      reason: `Coordinates (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}) are located in Pakistan. Cabzone operates strictly within India.`,
    };
  }

  // Sri Lanka: South of Tamil Nadu (Palk Strait)
  if (point.lat >= 5.9 && point.lat <= 9.8 && point.lng >= 79.6 && point.lng <= 81.9) {
    return {
      inside: false,
      country: 'Sri Lanka',
      countryCode: 'LK',
      reason: `Coordinates (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}) are located in Sri Lanka. Cabzone operates strictly within India.`,
    };
  }

  // China / Tibet: North of Sikkim & Himalayan ridge
  if (point.lat > 28.08 && point.lng >= 88.0 && point.lng <= 88.95) {
    return {
      inside: false,
      country: 'China',
      countryCode: 'CN',
      reason: `Coordinates (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}) are located across the northern Himalayan border in Tibet.`,
    };
  }

  return {
    inside: true,
    country: 'India',
    countryCode: 'IN',
  };
}

export function assertPointInIndia(point: { lat: number; lng: number }, label = 'Location'): void {
  const result = isPointInIndia(point);
  if (!result.inside) {
    throw new Error(`OUTSIDE_INDIA: ${label} must be within India. ${result.reason ?? ''}`);
  }
}

