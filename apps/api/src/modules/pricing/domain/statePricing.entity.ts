import type { StatePricingStatus } from '@cabzone/contracts';

export interface StatePricingEntity {
  id: string;
  stateCode: string;
  ratePerKmPaise: number;
  baseFarePaise: number;
  minimumFarePaise: number;
  version: number;
  status: StatePricingStatus;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
}

export function isStatePricingEffective(pricing: StatePricingEntity, now: Date = new Date()): boolean {
  if (pricing.status !== 'ACTIVE') return false;
  if (pricing.effectiveFrom > now) return false;
  if (pricing.effectiveTo !== null && pricing.effectiveTo <= now) return false;
  return true;
}
