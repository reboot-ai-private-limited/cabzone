import type { TollSnapshot } from './tolls.js';
import type { VehicleCategory } from './vehicles.js';

export const DEFAULT_CANCELLATION_FEE_PAISE = 5000; // ₹50
export const DEFAULT_DRIVER_COMPENSATION_PAISE = 3500; // ₹35
export const DEFAULT_PLATFORM_CANCELLATION_FEE_PAISE = 1500; // ₹15
export const DEFAULT_RIDER_CANCELLATION_GRACE_SECONDS = 120; // 2 minutes
export const DEFAULT_DRIVER_NO_SHOW_WAIT_SECONDS = 300; // 5 minutes

/**
 * Vehicle category pricing configuration.
 *
 * Per Decisions:
 * - D-025: Independent pricing per vehicle category.
 * - D-026: Percentage-based commission model.
 * - D-027: City override buffer with global default.
 * - D-028: Negotiation bounds (Floor: MAX(min_fare, 80%), Ceiling: 150%, Window: 90s).
 * - D-044: Configurable cancellation/no-show fees and timers per pricing config.
 */
export interface VehiclePricingConfig {
  vehicleCategory: VehicleCategory;
  baseFarePaise: number;
  ratePerKmPaise: number;
  minimumFarePaise: number;
  outstationBaseFarePaise?: number;
  outstationRatePerKmPaise?: number;
  outstationMinimumFarePaise?: number;
  bufferSurchargePaise: number;
  negotiationFloorPercent: number; // default: 80
  negotiationCeilingPercent: number; // default: 150
  negotiationWindowSeconds: number; // default: 90
  commissionPercent: number; // platform commission percentage
  cancellationFeePaise?: number; // default: 5000
  driverCompensationPaise?: number; // default: 3500
  platformCancellationFeePaise?: number; // default: 1500
  riderCancellationGraceSeconds?: number; // default: 120
  driverNoShowWaitSeconds?: number; // default: 300
}

export interface QuoteRequestDto {
  pickup: {
    lat: number;
    lng: number;
  };
  drop: {
    lat: number;
    lng: number;
  };
  vehicleCategory: VehicleCategory;
}

export interface VehicleQuoteOption {
  vehicleCategory: VehicleCategory;
  displayName: string;
  status: 'ACTIVE' | 'COMING_SOON';
  available: boolean;
  suggestedFarePaise?: number;
  negotiation?: {
    floorPaise: number;
    ceilingPaise: number;
  };
}

export interface StateDistanceBreakdown {
  stateCode: string;
  stateName: string;
  distanceM: number;
  distanceKm: number;
  percentage: number;
  ratePerKmPaise?: number | undefined;
  distanceFarePaise?: number | undefined;
}

export interface QuoteDto {
  tollSnapshot?: TollSnapshot | null;
  quoteId: string;
  pickup: { lat: number; lng: number };
  drop: { lat: number; lng: number };
  distanceM: number;
  estimatedDurationSeconds: number;
  serviceType: string;
  cityZoneId: string | null;
  cityName: string | null;
  bufferApplied: boolean;
  vehicleCategory: VehicleCategory;
  suggestedFarePaise: number;
  /** Unpaid rider cancellation/no-show fee arrears itemized above the ride fare (D-044). */
  arrearsPaise?: number | undefined;
  /** Suggested fare plus unpaid rider arrears (suggestedFarePaise + arrearsPaise). */
  totalEstimatedPayablePaise?: number | undefined;
  /** False when unpaid arrears >= effective cancellationFeePaise, blocking cash settlement (D-044). */
  cashAllowed?: boolean | undefined;
  pricingConfigId: string;
  pricingConfigVersion: number;
  /** Route label; state segment rates are recorded in stateBreakdown. */
  routeScope?: 'INTRA_STATE' | 'INTERSTATE' | null | undefined;
  originStateCode?: string | null | undefined;
  destinationStateCode?: string | null | undefined;
  originCountryCode?: string | null | undefined;
  destinationCountryCode?: string | null | undefined;
  originCityName?: string | null | undefined;
  destinationCityName?: string | null | undefined;
  stateBreakdown?: StateDistanceBreakdown[] | undefined;
  routeProvider?: string | undefined;
  negotiation: {
    floorPaise: number;
    ceilingPaise: number;
  };
  expiresAt: string;
  quoteToken: string;
}

export type CreateQuoteResponseDto = QuoteDto;

/**
 * Computes platform commission in integer paise.
 * D-026: Percentage of Agreed Fare.
 */
export function calculateCommissionPaise(
  agreedFarePaise: number,
  commissionPercent: number,
): number {
  return Math.round((agreedFarePaise * commissionPercent) / 100);
}

/**
 * Computes rider fare negotiation bounds in integer paise.
 * D-028:
 * - Floor: MAX(minimumFarePaise, ROUND(suggestedFarePaise * (floorPercent / 100)))
 * - Ceiling: ROUND(suggestedFarePaise * (ceilingPercent / 100))
 */
export function calculateNegotiationBounds(opts: {
  suggestedFarePaise: number;
  minimumFarePaise: number;
  floorPercent?: number;
  ceilingPercent?: number;
}): { floorPaise: number; ceilingPaise: number } {
  const floorPercent = opts.floorPercent ?? 80;
  const ceilingPercent = opts.ceilingPercent ?? 150;

  const floorPaise = Math.max(
    opts.minimumFarePaise,
    Math.round((opts.suggestedFarePaise * floorPercent) / 100),
  );
  const ceilingPaise = Math.round((opts.suggestedFarePaise * ceilingPercent) / 100);

  return { floorPaise, ceilingPaise };
}

export const PRICING_CONFIG_LEVELS = ['GLOBAL', 'STATE', 'CITY'] as const;
export type PricingConfigLevel = (typeof PRICING_CONFIG_LEVELS)[number];

export const PRICING_CONFIG_STATUSES = ['DRAFT', 'ACTIVE', 'RETIRED'] as const;
export type PricingConfigStatus = (typeof PRICING_CONFIG_STATUSES)[number];

export interface PricingConfigDto {
  id: string;
  level: PricingConfigLevel;
  cityZoneId: string | null;
  stateCode: string | null;
  stateName?: string | null | undefined;
  version: number;
  vehicleType: VehicleCategory;
  baseFarePaise: number;
  ratePerKmPaise: number;
  minimumFarePaise: number;
  outstationBaseFarePaise: number;
  outstationRatePerKmPaise: number;
  outstationMinimumFarePaise: number;
  bufferSurchargePaise: number;
  negotiationFloorPercent: number;
  negotiationCeilingPercent: number;
  negotiationWindowSeconds: number;
  commissionPercent: number;
  cancellationFeePaise: number;
  driverCompensationPaise: number;
  platformCancellationFeePaise: number;
  riderCancellationGraceSeconds: number;
  driverNoShowWaitSeconds: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: PricingConfigStatus;
  createdByAdminId: string;
  createdAt: string;
}

export interface CreatePricingConfigRequest {
  level?: PricingConfigLevel | undefined;
  cityZoneId?: string | null | undefined;
  stateCode?: string | null | undefined;
  vehicleType: VehicleCategory;
  baseFarePaise: number;
  ratePerKmPaise: number;
  minimumFarePaise: number;
  outstationBaseFarePaise?: number | undefined;
  outstationRatePerKmPaise?: number | undefined;
  outstationMinimumFarePaise?: number | undefined;
  bufferSurchargePaise?: number | undefined;
  negotiationFloorPercent?: number | undefined;
  negotiationCeilingPercent?: number | undefined;
  negotiationWindowSeconds?: number | undefined;
  commissionPercent?: number | undefined;
  cancellationFeePaise?: number | undefined;
  driverCompensationPaise?: number | undefined;
  platformCancellationFeePaise?: number | undefined;
  riderCancellationGraceSeconds?: number | undefined;
  driverNoShowWaitSeconds?: number | undefined;
  status?: 'DRAFT' | 'ACTIVE' | undefined;
  effectiveFrom?: string | undefined;
}

/** Patch-style update; live changes increment the config version. */
export interface UpdatePricingConfigRequest {
  stateCode?: string | null | undefined;
  baseFarePaise?: number | undefined;
  ratePerKmPaise?: number | undefined;
  minimumFarePaise?: number | undefined;
  outstationBaseFarePaise?: number | undefined;
  outstationRatePerKmPaise?: number | undefined;
  outstationMinimumFarePaise?: number | undefined;
  bufferSurchargePaise?: number | undefined;
  negotiationFloorPercent?: number | undefined;
  negotiationCeilingPercent?: number | undefined;
  negotiationWindowSeconds?: number | undefined;
  commissionPercent?: number | undefined;
  cancellationFeePaise?: number | undefined;
  driverCompensationPaise?: number | undefined;
  platformCancellationFeePaise?: number | undefined;
  riderCancellationGraceSeconds?: number | undefined;
  driverNoShowWaitSeconds?: number | undefined;
  effectiveFrom?: string | undefined;
  status?: PricingConfigStatus | undefined;
}

export interface ListPricingConfigsQuery {
  level?: PricingConfigLevel | undefined;
  cityZoneId?: string | undefined;
  stateCode?: string | undefined;
  vehicleType?: VehicleCategory | undefined;
  status?: PricingConfigStatus | undefined;
}
