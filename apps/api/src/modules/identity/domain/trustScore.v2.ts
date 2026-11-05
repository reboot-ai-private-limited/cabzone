import {
  MIN_PUBLIC_RATING_COUNT,
  MIN_PUBLIC_TRUST_SCORE_COMPLETED_RIDES,
  type TrustRiskFlag,
  type TrustScoreBreakdownDto,
  type TrustTier,
} from '@cabzone/contracts';

/**
 * Trust score v2 (decision D-048, amending D-021 and D-046).
 * Pure function. The same rules apply to riders and drivers; the caller supplies the counts that
 * belong to the user (see computeTripStats).
 */

/** All weights in one place so they can be tuned during shadow mode without touching the formula. */
export const TRUST_V2_CONFIG = {
  /** Ratings are pulled toward this mean until enough of them exist, so one rating cannot swing a score. */
  ratingPriorMean: 4.5,
  ratingPriorCount: 5,
  /** Penalty per star below the prior mean. */
  ratingPenaltyPerStar: 25,
  eliteRatingAverage: 4.8,
  eliteBonus: 5,
  /** Cancellation rate tolerated before any penalty. */
  cancellationFreeRate: 0.05,
  noShowPenalty: 10,
  disputePenalty: 15,
  unpaidPenalty: 10,
  experience: [
    { completedRides: 50, bonus: 5 },
    { completedRides: 20, bonus: 2 },
  ],
  /** Without enough revealed ratings, or with a recent dispute against the user, EXCELLENT is out of reach. */
  provisionalCap: 89,
  floor: 10,
  ceiling: 100,
  /** Early-account signals, used while the score itself is still hidden. */
  earlyCancelFlagAt: 3,
} as const;

export interface TrustScoreInputV2 {
  completedRides: number;
  /** Raw count of cancelled rides, whoever caused them. Shown for context only. */
  cancelledRides?: number | undefined;
  /** Cancellations this user caused (decayed). */
  responsibleCancellations: number;
  /** No-shows this user caused (decayed). */
  noShows: number;
  /** Disputes resolved against this user (decayed). */
  disputesAgainst: number;
  /** Rides left unpaid (riders only). */
  unpaidRides?: number | undefined;
  ratingAverage: number | null;
  ratingCount: number;
  /** Exact sum of revealed stars when known. Otherwise derived from average x count. */
  ratingSum?: number | null | undefined;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const finiteNonNegative = (n: number | undefined | null) =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;

export function calculateTrustScoreV2(input: TrustScoreInputV2): TrustScoreBreakdownDto {
  const cfg = TRUST_V2_CONFIG;
  const completed = finiteNonNegative(input.completedRides);
  const responsible = finiteNonNegative(input.responsibleCancellations);
  const noShows = finiteNonNegative(input.noShows);
  const disputes = finiteNonNegative(input.disputesAgainst);
  const unpaid = finiteNonNegative(input.unpaidRides);

  // Ratings: reject anything that is not a plausible 1..5 average (finding F13).
  let ratingCount = finiteNonNegative(input.ratingCount);
  let ratingSum = 0;
  if (ratingCount > 0) {
    if (typeof input.ratingSum === 'number' && Number.isFinite(input.ratingSum) && input.ratingSum > 0) {
      ratingSum = input.ratingSum;
    } else if (
      input.ratingAverage !== null &&
      Number.isFinite(input.ratingAverage) &&
      input.ratingAverage >= 1 &&
      input.ratingAverage <= 5
    ) {
      ratingSum = input.ratingAverage * ratingCount;
    } else {
      ratingCount = 0;
    }
  }
  const rawAverage = ratingCount > 0 ? ratingSum / ratingCount : null;
  const verifiedRatingAverage = rawAverage === null ? null : Number(rawAverage.toFixed(2));

  const attempts = completed + responsible;
  const cancellationRate = attempts > 0 ? responsible / attempts : 0;
  const completionRate = attempts > 0 ? Number((completed / attempts).toFixed(2)) : 1;

  const factors: TrustScoreBreakdownDto['factors'] = {
    completedRides: completed,
    cancelledRides: input.cancelledRides ?? Math.round(responsible),
    completionRate,
    ratingAverage: verifiedRatingAverage,
    ratingCount,
    disputesCount: Number(disputes.toFixed(2)),
    noShowsCount: Number(noShows.toFixed(2)),
    responsibleCancellations: Number(responsible.toFixed(2)),
    unpaidRides: unpaid,
  };
  const confidence = ratingCount >= MIN_PUBLIC_RATING_COUNT ? 'VERIFIED' : 'PROVISIONAL';

  // Hidden below the public threshold (D-046), but still raise flags so admins can act early.
  if (completed < MIN_PUBLIC_TRUST_SCORE_COMPLETED_RIDES) {
    const riskFlags: TrustRiskFlag[] = [];
    if (responsible >= cfg.earlyCancelFlagAt) riskFlags.push('EARLY_CANCEL_PATTERN');
    if (unpaid >= 1) riskFlags.push('EARLY_UNPAID');
    if (disputes >= 0.5) riskFlags.push('EARLY_DISPUTE');
    return {
      score: null,
      tier: 'UNRATED',
      isPreliminary: true,
      isPublic: false,
      confidence: 'PROVISIONAL',
      riskFlags,
      version: 2,
      factors,
      summary: `Requires at least ${MIN_PUBLIC_TRUST_SCORE_COMPLETED_RIDES} completed rides to generate a public trust score.`,
    };
  }

  let score: number = cfg.ceiling;

  // 1. Ratings, shrunk toward the prior mean so a single rating moves the score only a little.
  const effective =
    (cfg.ratingPriorCount * cfg.ratingPriorMean + ratingSum) / (cfg.ratingPriorCount + ratingCount);
  if (effective < cfg.ratingPriorMean) {
    score -= Math.round((cfg.ratingPriorMean - effective) * cfg.ratingPenaltyPerStar);
  }
  if (
    ratingCount >= MIN_PUBLIC_RATING_COUNT &&
    rawAverage !== null &&
    rawAverage >= cfg.eliteRatingAverage
  ) {
    score += cfg.eliteBonus;
  }

  // 2. Cancellations this user caused.
  if (cancellationRate > cfg.cancellationFreeRate) {
    score -= Math.round((cancellationRate - cfg.cancellationFreeRate) * 100);
  }

  // 3. No-shows, disputes lost, unpaid rides.
  score -= noShows * cfg.noShowPenalty;
  score -= disputes * cfg.disputePenalty;
  score -= unpaid * cfg.unpaidPenalty;

  // 4. Experience. Halved while any dispute counts against the user.
  const tierBonus = cfg.experience.find((e) => completed >= e.completedRides)?.bonus ?? 0;
  score += disputes > 0 ? tierBonus / 2 : tierBonus;

  // 5. Caps: EXCELLENT needs verified ratings and a clean recent record.
  if (ratingCount < MIN_PUBLIC_RATING_COUNT) score = Math.min(score, cfg.provisionalCap);
  if (disputes >= 0.5) score = Math.min(score, cfg.provisionalCap);

  const finalScore = clamp(Math.round(score), cfg.floor, cfg.ceiling);

  let tier: TrustTier;
  let summary: string;
  if (finalScore >= 90) {
    tier = 'EXCELLENT';
    summary = 'Top-tier trust profile with consistent completions and excellent feedback.';
  } else if (finalScore >= 75) {
    tier = 'GOOD';
    summary =
      confidence === 'PROVISIONAL'
        ? 'Good standing. The score is provisional until more ratings are in.'
        : 'Good platform standing with healthy ride completion rate.';
  } else if (finalScore >= 60) {
    tier = 'FAIR';
    summary = 'Fair trust score. Shows cancellation friction, disputes or lower ratings.';
  } else {
    tier = 'POOR';
    summary = 'Low trust profile under administrative observation due to cancellations or complaints.';
  }

  return {
    score: finalScore,
    tier,
    isPreliminary: confidence === 'PROVISIONAL',
    isPublic: true,
    confidence,
    riskFlags: [],
    version: 2,
    factors,
    summary,
  };
}
