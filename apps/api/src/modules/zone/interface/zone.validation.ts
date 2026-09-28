import { z } from 'zod';
import { ZONE_STATUSES, ZONE_TYPES } from '@cabzone/contracts';

export const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const geoJsonPolygonSchema = z
  .object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1),
  })
  .refine(
    (poly) => {
      const ring = poly.coordinates[0];
      if (!ring || ring.length < 4) return false;
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (!first || !last) return false;
      return Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9;
    },
    {
      message: 'Polygon exterior ring must have at least 4 coordinates and be closed (first and last vertex identical).',
    },
  );

export const geoJsonMultiPolygonSchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(z.tuple([z.number(), z.number()]))).min(1)).min(1),
});

export const geoJsonGeometrySchema = z.union([geoJsonPolygonSchema, geoJsonMultiPolygonSchema]);

export const createZoneSchema = z
  .object({
    name: z.string().min(2).max(100),
    code: z.string().min(2).max(50).toUpperCase().optional(),
    type: z.enum(ZONE_TYPES).optional(),
    zoneType: z.enum(ZONE_TYPES).optional(),
    parentCityZoneId: z.string().uuid().nullable().optional(),
    stateCode: z.string().length(2).toUpperCase(),
    geometry: geoJsonGeometrySchema.optional(),
    boundary: geoJsonPolygonSchema.optional(),
    bufferDistanceM: z.number().positive().nullable().optional(),
    currentPricingConfigId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (data) => {
      const resolvedType = data.zoneType ?? data.type;
      if (!resolvedType) return false;
      if (resolvedType === 'PICKUP' && !data.parentCityZoneId) {
        return false;
      }
      return true;
    },
    {
      message: 'PICKUP zone must specify a valid parentCityZoneId referencing its parent CITY.',
    },
  )
  .refine(
    (data) => Boolean(data.geometry || data.boundary),
    {
      message: 'Zone geometry or boundary is required.',
    },
  );

export const validateZoneSchema = z.object({
  type: z.enum(ZONE_TYPES),
  geometry: geoJsonGeometrySchema,
  excludeZoneId: z.string().uuid().nullable().optional(),
});

export const updateZoneSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  code: z.string().min(2).max(50).toUpperCase().optional(),
  stateCode: z.string().length(2).toUpperCase().optional(),
  parentCityZoneId: z.string().uuid().nullable().optional(),
  boundary: geoJsonPolygonSchema.optional(),
  geometry: geoJsonGeometrySchema.optional(),
  bufferDistanceM: z.number().positive().nullable().optional(),
  status: z.enum(ZONE_STATUSES).optional(),
  currentPricingConfigId: z.string().uuid().nullable().optional(),
});

export const updateZoneGeometrySchema = z.object({
  expectedVersion: z.number().int().min(1),
  geometry: geoJsonGeometrySchema,
});

export const deactivateZoneSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const listZonesQuerySchema = z.object({
  status: z.enum(ZONE_STATUSES).optional(),
  zoneType: z.enum(ZONE_TYPES).optional(),
  type: z.enum(ZONE_TYPES).optional(),
  parentCityZoneId: z.string().uuid().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const zoneIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const resolveZonesRequestSchema = z.object({
  pickup: geoPointSchema,
  drop: geoPointSchema,
  throwOnExclusion: z.boolean().optional(),
});
