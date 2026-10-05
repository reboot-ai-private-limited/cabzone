import type { TrustScoreBreakdownDto, TrustTier } from '@cabzone/contracts';

export interface TrustScoreInput {
  completedRides: number;
  cancelledRides: number;
  ratingAverage: number | null;
  ratingCount: number;
  disputesCount?: number | undefined;
}

/**
 * Deterministic Trust Score Engine
 * References: PRD §5.7, Decision D-021, LLD §4.18, LLD §11
 */
export function calculateTrustScore(input: TrustScoreInput): TrustScoreBreakdownDto {
  const { completedRides, cancelledRides, ratingAverage, ratingCount } = input;
  const disputesCount = input.disputesCount ?? 0;
  const totalRides = completedRides + cancelledRides;

  // Decision D-021 & LLD §4.18: Cold-start threshold
  // Hide or mark as UNRATED until at least 3 attempted/completed rides exist
  if (totalRides < 3) {
    return {
      score: null,
      tier: 'UNRATED',
      isPreliminary: true,
      factors: {
        completedRides,
        cancelledRides,
        completionRate: totalRides > 0 ? Number((completedRides / totalRides).toFixed(2)) : 1,
        ratingAverage,
        ratingCount,
        disputesCount,
      },
      summary: 'Requires at least 3 completed or attempted rides to generate trust score.',
    };
  }

  // Baseline starting score
  let score = 100;

  // 1. Rating Factor (Baseline: 4.5★)
  if (ratingAverage !== null) {
    if (ratingAverage >= 4.8) {
      score += 5; // Elite rating bonus
    } else if (ratingAverage < 4.5) {
      // Sub-baseline penalty (e.g. 4.0 = -13, 3.5 = -25)
      const penalty = Math.round((4.5 - ratingAverage) * 25);
      score -= penalty;
    }
  }

  // 2. Cancellation Rate Factor
  const completionRate = totalRides > 0 ? completedRides / totalRides : 1;
  const cancellationRate = 1 - completionRate;

  if (cancellationRate > 0.05) {
    // Normal ride cancellation allowance is up to 5%
    // Each 10% excessive cancellation drops ~10 points
    const cancelPenalty = Math.round((cancellationRate - 0.05) * 100);
    score -= cancelPenalty;
  }

  // 3. Dispute & Misconduct Penalties (PRD §5.7)
  score -= disputesCount * 15;

  // 4. Experience & Proven Reliability Factor
  if (completedRides >= 50) {
    score += 5;
  } else if (completedRides >= 20) {
    score += 2;
  }

  // Clamp score strictly between 10 and 100
  const finalScore = Math.max(10, Math.min(100, Math.round(score)));

  let tier: TrustTier = 'GOOD';
  let summary = 'Reliable community member with standard trust metrics.';

  if (finalScore >= 90) {
    tier = 'EXCELLENT';
    summary = 'Top-tier trust profile with consistent completions and excellent feedback.';
  } else if (finalScore >= 75) {
    tier = 'GOOD';
    summary = 'Good platform standing with healthy ride completion rate.';
  } else if (finalScore >= 60) {
    tier = 'FAIR';
    summary = 'Fair trust score. Shows minor cancellation friction or lower rating.';
  } else {
    tier = 'POOR';
    summary = 'Low trust profile under administrative observation due to cancellations or complaints.';
  }

  return {
    score: finalScore,
    tier,
    isPreliminary: false,
    factors: {
      completedRides,
      cancelledRides,
      completionRate: Number(completionRate.toFixed(2)),
      ratingAverage,
      ratingCount,
      disputesCount,
    },
    summary,
  };
}
