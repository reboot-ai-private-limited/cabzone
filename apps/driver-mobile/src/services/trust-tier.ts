import type { PublicTrustTier } from '@cabzone/contracts';

/**
 * Wording for the trust tier shown to the other party before and during a ride (D-048).
 * Only the tier is shown, never the number. A missing tier means the score is not public yet.
 */
const LABELS: Record<PublicTrustTier, string> = {
  EXCELLENT: 'Excellent',
  GOOD: 'Good',
  FAIR: 'Fair',
  POOR: 'Low',
};

export function trustTierLabel(tier: PublicTrustTier | null | undefined): string | null {
  return tier ? (LABELS[tier] ?? null) : null;
}
