import { z } from 'zod';
import {
  DEFAULT_CANCELLATION_FEE_PAISE,
  DEFAULT_DRIVER_COMPENSATION_PAISE,
  DEFAULT_PLATFORM_CANCELLATION_FEE_PAISE,
  PRICING_CONFIG_LEVELS,
  PRICING_CONFIG_STATUSES,
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

function isValidCancellationFeeInput(data: {
  cancellationFeePaise?: number | undefined;
  driverCompensationPaise?: number | undefined;
  platformCancellationFeePaise?: number | undefined;
}): boolean {
  const { cancellationFeePaise: total, driverCompensationPaise: driver, platformCancellationFeePaise: platform } = data;
  if (total !== undefined && driver !== undefined && platform !== undefined) {
    return driver + platform === total;
  }
  if (total !== undefined && driver !== undefined && platform === undefined) {
    return total - driver >= 0;
  }
  if (total !== undefined && platform !== undefined && driver === undefined) {
    return total - platform >= 0;
  }
  if (driver !== undefined && platform !== undefined && total === undefined) {
    return true;
  }
  if (total !== undefined && driver === undefined && platform === undefined) {
    return total === DEFAULT_DRIVER_COMPENSATION_PAISE + DEFAULT_PLATFORM_CANCELLATION_FEE_PAISE;
  }
  if (driver !== undefined && total === undefined && platform === undefined) {
    return driver + DEFAULT_PLATFORM_CANCELLATION_FEE_PAISE === DEFAULT_CANCELLATION_FEE_PAISE;
  }
  if (platform !== undefined && total === undefined && driver === undefined) {
    return DEFAULT_DRIVER_COMPENSATION_PAISE + platform === DEFAULT_CANCELLATION_FEE_PAISE;
  }
  return true;
}

export const createPricingConfigSchema = z
  .object({
    level: z.enum(PRICING_CONFIG_LEVELS).optional(),
    cityZoneId: z.string().nullable().optional(),
    stateCode: z.string().trim().toUpperCase().length(2).nullable().optional(),
    vehicleType: z.enum(VEHICLE_CATEGORIES),
    baseFarePaise: z.number().int().min(0, 'baseFarePaise must be non-negative'),
    ratePerKmPaise: z.number().int().positive('ratePerKmPaise must be positive'),
    minimumFarePaise: z.number().int().positive('minimumFarePaise must be positive'),
    outstationBaseFarePaise: z
      .number()
      .int()
      .min(0, 'outstationBaseFarePaise must be non-negative')
      .optional(),
    outstationRatePerKmPaise: z
      .number()
      .int()
      .positive('outstationRatePerKmPaise must be positive')
      .optional(),
    outstationMinimumFarePaise: z
      .number()
      .int()
      .positive('outstationMinimumFarePaise must be positive')
      .optional(),
    bufferSurchargePaise: z.number().int().min(0).default(0),
    negotiationFloorPercent: z.number().int().min(10).max(100).default(80),
    negotiationCeilingPercent: z.number().int().min(100).max(300).default(150),
    negotiationWindowSeconds: z.number().int().min(15).max(300).default(90),
    commissionPercent: z.number().min(0).max(100).default(8),
    cancellationFeePaise: z.number().int().min(0).optional(),
    driverCompensationPaise: z.number().int().min(0).optional(),
    platformCancellationFeePaise: z.number().int().min(0).optional(),
    riderCancellationGraceSeconds: z.number().int().min(0).max(3600).optional(),
    driverNoShowWaitSeconds: z.number().int().min(0).max(3600).optional(),
    status: z.enum(['DRAFT', 'ACTIVE']).default('DRAFT'),
    effectiveFrom: z.string().optional(),
    effectiveTo: z.string().nullable().optional(),
    createdByAdminId: z.string().optional(),
  })
  .refine(
    (data) => {
      const level = data.level ?? (data.stateCode ? 'STATE' : data.cityZoneId ? 'CITY' : 'GLOBAL');
      if (level === 'CITY') return Boolean(data.cityZoneId && data.cityZoneId.trim().length > 0);
      if (level === 'STATE') return Boolean(data.stateCode && data.stateCode.trim().length === 2);
      return true;
    },
    {
      message: 'cityZoneId is required for CITY level, stateCode is required for STATE level',
      path: ['cityZoneId'],
    },
  )
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
  )
  .refine(
    (data) => {
      const base = data.outstationBaseFarePaise ?? data.baseFarePaise;
      const min = data.outstationMinimumFarePaise ?? data.minimumFarePaise;
      return min >= base;
    },
    {
      message: 'outstationMinimumFarePaise must be greater than or equal to outstationBaseFarePaise',
      path: ['outstationMinimumFarePaise'],
    },
  )
  .refine(isValidCancellationFeeInput, {
    message:
      'driverCompensationPaise + platformCancellationFeePaise must equal cancellationFeePaise and all amounts must be non-negative',
    path: ['cancellationFeePaise'],
  });

export const updatePricingConfigSchema = z
  .object({
    stateCode: z.string().trim().toUpperCase().length(2).nullable().optional(),
    baseFarePaise: z.number().int().min(0, 'baseFarePaise must be non-negative').optional(),
    ratePerKmPaise: z.number().int().positive('ratePerKmPaise must be positive').optional(),
    minimumFarePaise: z.number().int().positive('minimumFarePaise must be positive').optional(),
    outstationBaseFarePaise: z
      .number()
      .int()
      .min(0, 'outstationBaseFarePaise must be non-negative')
      .optional(),
    outstationRatePerKmPaise: z
      .number()
      .int()
      .positive('outstationRatePerKmPaise must be positive')
      .optional(),
    outstationMinimumFarePaise: z
      .number()
      .int()
      .positive('outstationMinimumFarePaise must be positive')
      .optional(),
    bufferSurchargePaise: z.number().int().min(0).optional(),
    negotiationFloorPercent: z.number().int().min(10).max(100).optional(),
    negotiationCeilingPercent: z.number().int().min(100).max(300).optional(),
    negotiationWindowSeconds: z.number().int().min(15).max(300).optional(),
    commissionPercent: z.number().min(0).max(100).optional(),
    cancellationFeePaise: z.number().int().min(0).optional(),
    driverCompensationPaise: z.number().int().min(0).optional(),
    platformCancellationFeePaise: z.number().int().min(0).optional(),
    riderCancellationGraceSeconds: z.number().int().min(0).max(3600).optional(),
    driverNoShowWaitSeconds: z.number().int().min(0).max(3600).optional(),
    effectiveFrom: z.string().optional(),
    status: z.enum(PRICING_CONFIG_STATUSES).optional(),
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
  )
  .refine(
    (data) =>
      data.outstationMinimumFarePaise === undefined ||
      data.outstationBaseFarePaise === undefined ||
      data.outstationMinimumFarePaise >= data.outstationBaseFarePaise,
    {
      message: 'outstationMinimumFarePaise must be greater than or equal to outstationBaseFarePaise',
      path: ['outstationMinimumFarePaise'],
    },
  )
  .refine(
    (data) =>
      data.cancellationFeePaise === undefined ||
      data.driverCompensationPaise === undefined ||
      data.platformCancellationFeePaise === undefined ||
      data.driverCompensationPaise + data.platformCancellationFeePaise === data.cancellationFeePaise,
    {
      message:
        'driverCompensationPaise + platformCancellationFeePaise must equal cancellationFeePaise',
      path: ['cancellationFeePaise'],
    },
  );

export const listPricingConfigsSchema = z.object({
  level: z.enum(PRICING_CONFIG_LEVELS).optional(),
  cityZoneId: z.string().optional(),
  stateCode: z.string().optional(),
  vehicleType: z.enum(VEHICLE_CATEGORIES).optional(),
  status: z.enum(PRICING_CONFIG_STATUSES).optional(),
});
