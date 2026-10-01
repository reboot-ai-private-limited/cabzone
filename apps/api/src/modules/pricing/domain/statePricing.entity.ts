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
  createdByAdminId?: string | null | undefined;
  createdAt: Date;
}

export function isStatePricingEffective(
  pricing: StatePricingEntity,
  now: Date = new Date(),
): boolean {
  return (
    pricing.status === 'ACTIVE' &&
    pricing.effectiveFrom <= now &&
    (pricing.effectiveTo === null || pricing.effectiveTo > now)
  );
}
