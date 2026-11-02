import type { TollInfoDto, VehicleCategory } from '@cabzone/contracts';
import type { GeoPoint } from '@cabzone/geo';

export interface RouteRequest {
  origin: GeoPoint;
  destination: GeoPoint;
  /** Intermediate stops, visited in order between origin and destination. */
  waypoints?: GeoPoint[];
  vehicleCategory: VehicleCategory;
}

export interface RouteResult {
  tollInfo?: TollInfoDto;
  provider: string; // 'GOOGLE_ROUTES' | 'HAVERSINE_ESTIMATE'
  distanceM: number; // integer metres
  durationS: number; // integer seconds
  polyline: string | null; // encoded polyline, kept OUT of quote tokens
}
