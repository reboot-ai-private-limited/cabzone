import type {
  PricingConfigStatus,
  VehicleCategory,
} from '@cabzone/contracts';

export interface PricingConfigEntity {
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
  effectiveFrom: Date;
  effectiveTo: Date | null;
  status: PricingConfigStatus;
  createdByAdminId: string;
  createdAt: Date;
}

export function isPricingConfigEffective(
  config: PricingConfigEntity,
  now: Date = new Date(),
): boolean {
  return (
    config.status === 'ACTIVE' &&
    config.effectiveFrom <= now &&
    (config.effectiveTo === null || config.effectiveTo > now)
  );
}

export function calculateBaseFareEstimate(opts: {
  config: PricingConfigEntity;
  distanceM: number;
  isBufferFallback?: boolean;
}): number {
  const { config, distanceM, isBufferFallback = false } = opts;
  const billableDistanceM = Math.max(0, distanceM - config.includedDistanceM);
  const distanceFarePaise = Math.round((billableDistanceM / 1000) * config.ratePerKmPaise);
  const bufferSurcharge = isBufferFallback ? config.bufferSurchargePaise : 0;
  const subtotal = config.baseFarePaise + distanceFarePaise + bufferSurcharge;
  return Math.max(config.minimumFarePaise, subtotal);
}
