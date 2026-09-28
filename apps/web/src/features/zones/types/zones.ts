export * from '@cabzone/contracts';
import type {
  CreateZoneInputDto,
  GeoJsonGeometry,
  GeoJsonPolygon,
  UpdateZoneGeometryRequest,
  UpdateZoneMetadataRequest,
  ZoneAuditDto,
  ZoneDto,
  ZoneStatus,
  ZoneType,
  ZoneValidationResult,
} from '@cabzone/contracts';

export type ZoneViewMode = 'list' | 'map';

export interface ZoneFilterState {
  type: ZoneType | 'ALL';
  status: ZoneStatus | 'ALL';
  search: string;
  page: number;
  limit: number;
}

export interface ZoneFormData {
  name: string;
  code: string;
  type: ZoneType;
  parentCityZoneId: string | null;
  stateCode: string;
  geometry: GeoJsonGeometry | null;
  bufferDistanceM: number | null;
}

export interface ZoneMapPoint {
  x: number;
  y: number;
}

export type {
  CreateZoneInputDto,
  GeoJsonGeometry,
  GeoJsonPolygon,
  UpdateZoneGeometryRequest,
  UpdateZoneMetadataRequest,
  ZoneAuditDto,
  ZoneDto,
  ZoneStatus,
  ZoneType,
  ZoneValidationResult,
};
