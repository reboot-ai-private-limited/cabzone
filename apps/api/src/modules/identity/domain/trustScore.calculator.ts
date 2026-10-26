import {
  MIN_PUBLIC_RATING_COUNT,
  MIN_PUBLIC_TRUST_SCORE_COMPLETED_RIDES,
  type TrustScoreBreakdownDto,
  type TrustTier,
} from '@cabzone/contracts';

export interface TrustScoreInput {
  completedRides: number;
  cancelledRides: number;
  ratingAverage: number | null;
  ratingCount: number;
  disputesCount?: number | undefined;
  noShowsCount?: number | undefined;
}

/**
 * Deterministic Trust Score Engine
 * References: PRD §5.7, Decision D-021, Decision D-046, OQ-018, LLD §4.18
 */
export function calculateTrustScore(input: TrustScoreInput): TrustScoreBreakdownDto {
  const { completedRides, cancelledRides, ratingCount } = input;
  const disputesCount = input.disputesCount ?? 0;
  const noShowsCount = input.noShowsCount ?? 0;
  const totalRides = completedRides + cancelledRides;
  const verifiedRatingAverage =
    ratingCount > 0 && input.ratingAverage !== null && Number.isFinite(input.ratingAverage)
      ? input.ratingAverage
      : null;

  // Decision D-046 & OQ-018: Hide public trust score until at least 5 completed rides exist,
  // and never infer or fabricate default star averages when ratingCount === 0.
  if (completedRides < MIN_PUBLIC_TRUST_SCORE_COMPLETED_RIDES) {
    return {
      score: null,
      tier: 'UNRATED',
      isPreliminary: true,
      isPublic: false,
      factors: {
        completedRides,
        cancelledRides,
        completionRate: totalRides > 0 ? Number((completedRides / totalRides).toFixed(2)) : 1,
        ratingAverage: verifiedRatingAverage,
        ratingCount,
        disputesCount,
        noShowsCount,
      },
      summary: `Requires at least ${MIN_PUBLIC_TRUST_SCORE_COMPLETED_RIDES} completed rides to generate a public trust score.`,
    };
  }

  let score = 100;

  // 1. Revealed Rating Factor (Baseline: 4.5★; elite bonus requires >= 5 revealed ratings)
  if (verifiedRatingAverage !== null) {
    if (ratingCount >= MIN_PUBLIC_RATING_COUNT && verifiedRatingAverage >= 4.8) {
      score += 5;
    } else if (verifiedRatingAverage < 4.5) {
      const penalty = Math.round((4.5 - verifiedRatingAverage) * 25);
      score -= penalty;
    }
  }

  // 2. Cancellation Rate Factor
  const completionRate = totalRides > 0 ? completedRides / totalRides : 1;
  const cancellationRate = 1 - completionRate;

  if (cancellationRate > 0.05) {
    const cancelPenalty = Math.round((cancellationRate - 0.05) * 100);
    score -= cancelPenalty;
  }

  // 3. No-Show & Dispute Penalties (D-046 & PRD §5.7)
  score -= noShowsCount * 10;
  score -= disputesCount * 15;

  // 4. Experience & Proven Reliability Factor
  if (completedRides >= 50) {
    score += 5;
  } else if (completedRides >= 20) {
    score += 2;
  }

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
    summary =
      'Low trust profile under administrative observation due to cancellations or complaints.';
  }

  return {
    score: finalScore,
    tier,
    isPreliminary: false,
    isPublic: true,
    factors: {
      completedRides,
      cancelledRides,
      completionRate: Number(completionRate.toFixed(2)),
      ratingAverage: verifiedRatingAverage,
      ratingCount,
      disputesCount,
      noShowsCount,
    },
    summary,
  };
}
