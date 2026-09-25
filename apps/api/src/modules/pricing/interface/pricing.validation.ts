import { z } from 'zod';
import {
  PRICING_CONFIG_STATUSES,
  STATE_PRICING_STATUSES,
  VEHICLE_CATEGORIES,
  ZONE_STATUSES,
} from '@cabzone/contracts';

export const geoJsonPolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z
    .array(z.array(z.tuple([z.number(), z.number()])))
    .min(1, 'Polygon must have at least one linear ring'),
});

export const createCityZoneSchema = z.object({
  cityName: z.string().trim().min(1, 'City name is required').max(100),
  stateCode: z
    .string()
    .trim()
    .toUpperCase()
    .length(2, 'State code must be 2 letters (e.g. WB, BR, UP)'),
  boundary: geoJsonPolygonSchema,
  bufferDistanceM: z.number().int().positive().nullable().optional(),
});

export const updateCityZoneSchema = z.object({
  status: z.enum(ZONE_STATUSES).optional(),
  bufferDistanceM: z.number().int().positive().nullable().optional(),
  currentPricingConfigId: z.string().uuid().nullable().optional(),
});

export const createPricingConfigSchema = z
  .object({
    cityZoneId: z.string().uuid('Invalid cityZoneId UUID'),
    vehicleType: z.enum(VEHICLE_CATEGORIES),
    baseFarePaise: z.number().int().min(0, 'baseFarePaise must be non-negative'),
    ratePerKmPaise: z.number().int().positive('ratePerKmPaise must be positive'),
    minimumFarePaise: z.number().int().positive('minimumFarePaise must be positive'),
    includedDistanceM: z.number().int().min(0).default(0),
    bufferSurchargePaise: z.number().int().min(0).default(0),
    negotiationFloorPercent: z.number().int().min(10).max(100).default(80),
    negotiationCeilingPercent: z.number().int().min(100).max(300).default(150),
    negotiationWindowSeconds: z.number().int().min(15).max(300).default(90),
    commissionPercent: z.number().min(0).max(100).default(0),
    effectiveFrom: z.coerce.date(),
    effectiveTo: z.coerce.date().nullable().optional(),
    createdByAdminId: z.string().uuid('Invalid createdByAdminId UUID'),
  })
  .refine(
    (data) => data.negotiationCeilingPercent >= data.negotiationFloorPercent,
    {
      message: 'negotiationCeilingPercent must be greater than or equal to negotiationFloorPercent',
      path: ['negotiationCeilingPercent'],
    },
  )
  .refine(
    (data) => data.minimumFarePaise >= data.baseFarePaise,
    {
      message: 'minimumFarePaise must be greater than or equal to baseFarePaise',
      path: ['minimumFarePaise'],
    },
  );

export const createStatePricingSchema = z.object({
  stateCode: z.string().trim().toUpperCase().length(2),
  ratePerKmPaise: z.number().int().positive(),
  baseFarePaise: z.number().int().min(0),
  minimumFarePaise: z.number().int().positive(),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().nullable().optional(),
});

export const zoneStatusSchema = z.enum(ZONE_STATUSES);
export const pricingConfigStatusSchema = z.enum(PRICING_CONFIG_STATUSES);
export const statePricingStatusSchema = z.enum(STATE_PRICING_STATUSES);
