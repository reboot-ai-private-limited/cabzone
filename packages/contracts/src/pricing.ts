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
