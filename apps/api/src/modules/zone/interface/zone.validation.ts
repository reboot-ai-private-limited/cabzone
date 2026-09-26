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
      return first[0] === last[0] && first[1] === last[1];
    },
    {
      message: 'Polygon exterior ring must have at least 4 coordinates and be closed (first and last vertex identical).',
    },
  );

export const createZoneSchema = z
  .object({
    name: z.string().min(2).max(100),
    zoneType: z.enum(ZONE_TYPES),
    parentCityZoneId: z.string().uuid().nullable().optional(),
    stateCode: z.string().length(2).toUpperCase(),
    boundary: geoJsonPolygonSchema,
    bufferDistanceM: z.number().positive().nullable().optional(),
    currentPricingConfigId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.zoneType === 'PICKUP' && !data.parentCityZoneId) {
        return false;
      }
      return true;
    },
    {
      message: 'PICKUP zone must specify a valid parentCityZoneId referencing its parent CITY.',
    },
  );

export const updateZoneSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  parentCityZoneId: z.string().uuid().nullable().optional(),
  boundary: geoJsonPolygonSchema.optional(),
  bufferDistanceM: z.number().positive().nullable().optional(),
  status: z.enum(ZONE_STATUSES).optional(),
  currentPricingConfigId: z.string().uuid().nullable().optional(),
});

export const listZonesQuerySchema = z.object({
  status: z.enum(ZONE_STATUSES).optional(),
  zoneType: z.enum(ZONE_TYPES).optional(),
  parentCityZoneId: z.string().uuid().optional(),
});

export const zoneIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const resolveZonesRequestSchema = z.object({
  pickup: geoPointSchema,
  drop: geoPointSchema,
  throwOnExclusion: z.boolean().optional(),
});
