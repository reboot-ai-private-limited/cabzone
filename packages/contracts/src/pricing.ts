import type { VehicleCategory } from './vehicles.js';

/**
 * Vehicle category pricing configuration.
 *
 * Per Decisions:
 * - D-025: Independent pricing per vehicle category.
 * - D-026: Percentage-based commission model.
 * - D-027: City override buffer with global default.
 * - D-028: Negotiation bounds (Floor: MAX(min_fare, 80%), Ceiling: 150%, Window: 90s).
 */
export interface VehiclePricingConfig {
  vehicleCategory: VehicleCategory;
  baseFarePaise: number;
  ratePerKmPaise: number;
  minimumFarePaise: number;
  includedDistanceM: number;
  bufferSurchargePaise: number;
  negotiationFloorPercent: number; // default: 80
  negotiationCeilingPercent: number; // default: 150
  negotiationWindowSeconds: number; // default: 90
  commissionPercent: number; // platform commission percentage
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
  vehicleCategory?: VehicleCategory;
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

export interface QuoteDto {
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
  pricingConfigId: string;
  pricingConfigVersion: number;
  negotiation: {
    floorPaise: number;
    ceilingPaise: number;
  };
  expiresAt: string;
  quoteToken: string;
}

export interface CreateQuoteResponseDto {
  quotes: QuoteDto[];
  expiresAt: string;
}

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

export const PRICING_CONFIG_STATUSES = ['DRAFT', 'ACTIVE', 'RETIRED'] as const;
export type PricingConfigStatus = (typeof PRICING_CONFIG_STATUSES)[number];

export interface PricingConfigDto {
  id: string;
  cityZoneId: string;
  version: number;
  vehicleType: VehicleCategory;
  baseFarePaise: number;
  ratePerKmPaise: number;
  minimumFarePaise: number;
  includedDistanceM: number;
  bufferSurchargePaise: number;
  negotiationFloorPercent: number;
  negotiationCeilingPercent: number;
  negotiationWindowSeconds: number;
  commissionPercent: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: PricingConfigStatus;
  createdByAdminId: string;
  createdAt: string;
}

export const STATE_PRICING_STATUSES = ['ACTIVE', 'RETIRED'] as const;
export type StatePricingStatus = (typeof STATE_PRICING_STATUSES)[number];

export interface StatePricingDto {
  id: string;
  stateCode: string;
  ratePerKmPaise: number;
  baseFarePaise: number;
  minimumFarePaise: number;
  version: number;
  status: StatePricingStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
}

