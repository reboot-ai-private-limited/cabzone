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
    cityZoneId: z.string().min(1, 'cityZoneId is required'),
    vehicleType: z.enum(VEHICLE_CATEGORIES),
    baseFarePaise: z.number().int().min(0, 'baseFarePaise must be non-negative'),
    ratePerKmPaise: z.number().int().positive('ratePerKmPaise must be positive'),
    minimumFarePaise: z.number().int().positive('minimumFarePaise must be positive'),
    includedDistanceM: z.number().int().min(0).default(0),
    bufferSurchargePaise: z.number().int().min(0).default(0),
    negotiationFloorPercent: z.number().int().min(10).max(100).default(80),
    negotiationCeilingPercent: z.number().int().min(100).max(300).default(150),
    negotiationWindowSeconds: z.number().int().min(15).max(300).default(90),
    commissionPercent: z.number().min(0).max(100).default(8),
    status: z.enum(['DRAFT', 'ACTIVE']).default('DRAFT'),
    effectiveFrom: z.string().optional(),
    effectiveTo: z.string().nullable().optional(),
    createdByAdminId: z.string().optional(),
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

export const updatePricingConfigSchema = z
  .object({
    baseFarePaise: z.number().int().min(0, 'baseFarePaise must be non-negative').optional(),
    ratePerKmPaise: z.number().int().positive('ratePerKmPaise must be positive').optional(),
    minimumFarePaise: z.number().int().positive('minimumFarePaise must be positive').optional(),
    includedDistanceM: z.number().int().min(0).optional(),
    bufferSurchargePaise: z.number().int().min(0).optional(),
    negotiationFloorPercent: z.number().int().min(10).max(100).optional(),
    negotiationCeilingPercent: z.number().int().min(100).max(300).optional(),
    negotiationWindowSeconds: z.number().int().min(15).max(300).optional(),
    commissionPercent: z.number().min(0).max(100).optional(),
    effectiveFrom: z.string().optional(),
  })
  .refine(
    (data) =>
      data.negotiationCeilingPercent === undefined ||
      data.negotiationFloorPercent === undefined ||
      data.negotiationCeilingPercent >= data.negotiationFloorPercent,
    {
      message: 'negotiationCeilingPercent must be greater than or equal to negotiationFloorPercent',
      path: ['negotiationCeilingPercent'],
    },
  )
  .refine(
    (data) =>
      data.minimumFarePaise === undefined ||
      data.baseFarePaise === undefined ||
      data.minimumFarePaise >= data.baseFarePaise,
    {
      message: 'minimumFarePaise must be greater than or equal to baseFarePaise',
      path: ['minimumFarePaise'],
    },
  );

export const listPricingConfigsSchema = z.object({
  cityZoneId: z.string().optional(),
  vehicleType: z.enum(VEHICLE_CATEGORIES).optional(),
  status: z.enum(PRICING_CONFIG_STATUSES).optional(),
});

export const createStatePricingSchema = z.object({
  stateCode: z.string().trim().toUpperCase().length(2, 'State code must be 2 letters'),
  ratePerKmPaise: z.number().int().positive('ratePerKmPaise must be positive'),
  baseFarePaise: z.number().int().min(0, 'baseFarePaise must be non-negative'),
  minimumFarePaise: z.number().int().positive('minimumFarePaise must be positive'),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().nullable().optional(),
  status: z.enum(STATE_PRICING_STATUSES).default('ACTIVE'),
});

export const listStatePricingSchema = z.object({
  status: z.enum(STATE_PRICING_STATUSES).optional(),
});
