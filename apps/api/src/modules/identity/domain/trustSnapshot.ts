import type { TrustScoreBreakdownDto, TrustTier } from '@cabzone/contracts';

/** What gets stored on a rider or driver after a trust score refresh. */
export interface TrustSnapshot {
  score: number | null;
  tier: TrustTier;
  breakdown: TrustScoreBreakdownDto;
  updatedAt: Date;
}
