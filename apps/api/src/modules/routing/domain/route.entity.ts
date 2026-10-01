import type { GeoPoint } from '@cabzone/geo';
import type { VehicleCategory } from '@cabzone/contracts';

export interface RouteRequest {
  origin: GeoPoint;
  destination: GeoPoint;
  vehicleCategory: VehicleCategory;
}

export interface RouteResult {
  provider: string; // 'GOOGLE_ROUTES' | 'HAVERSINE_ESTIMATE'
  distanceM: number; // integer metres
  durationS: number; // integer seconds
  polyline: string | null; // encoded polyline, kept OUT of quote tokens
}

