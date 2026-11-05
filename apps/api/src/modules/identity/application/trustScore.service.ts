import type { PublicTrustTier, TrustRole, TrustScoreBreakdownDto } from '@cabzone/contracts';
import { logger } from '../../../shared/logging/logger.js';
import type {
  TripStats,
  RideRepositoryPort,
} from '../../rides/rides.public.js';
import { emptyTripStats } from '../../rides/rides.public.js';
import type { DriverRepositoryPort } from '../domain/driver.port.js';
import type { RiderRepositoryPort } from '../domain/rider.port.js';
import { calculateTrustScore } from '../domain/trustScore.calculator.js';
import { calculateTrustScoreV2 } from '../domain/trustScore.v2.js';

/**
 * off:    v1 only, nothing else computed.
 * shadow: v1 stays authoritative; v2 is computed and the difference is logged for review.
 * on:     v2 is authoritative.
 */
export type TrustScoreMode = 'off' | 'shadow' | 'on';

export interface TrustProfileInput {
  id: string;
  ratingAverage: number | null;
  ratingCount: number;
  ratingSum?: number | undefined;
}

export interface TrustEvaluation {
  /** The breakdown that is shown and stored under the current mode. */
  active: TrustScoreBreakdownDto;
  v1: TrustScoreBreakdownDto;
  v2: TrustScoreBreakdownDto;
  stats: TripStats;
}

export interface PublicTrust {
  tier: PublicTrustTier;
}

export interface TrustScoreServiceDeps {
  riderRepo: RiderRepositoryPort;
  driverRepo: DriverRepositoryPort;
  rideRepo?: RideRepositoryPort | undefined;
  mode?: TrustScoreMode | undefined;
  now?: (() => Date) | undefined;
  /** Delay before a scheduled refresh runs, so the ride transaction that caused it has committed. */
  debounceMs?: number | undefined;
}

export class TrustScoreService {
  private readonly mode: TrustScoreMode;
  private readonly debounceMs: number;
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly deps: TrustScoreServiceDeps) {
    this.mode = deps.mode ?? 'on';
    this.debounceMs = deps.debounceMs ?? 2_000;
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  /** Statistics for many users with one query. Every caller uses this, so the numbers always agree. */
  async loadStats(role: TrustRole, ids: string[]): Promise<Map<string, TripStats>> {
    if (ids.length === 0 || !this.deps.rideRepo) return new Map();
    try {
      return await this.deps.rideRepo.getTripStats(role, ids, this.now());
    } catch (err) {
      logger.warn({ err: String(err), role }, 'trust stats lookup failed; using empty stats');
      return new Map();
    }
  }

  evaluate(role: TrustRole, profile: TrustProfileInput, stats: TripStats | undefined): TrustEvaluation {
    const s = stats ?? emptyTripStats();
    const v2 = calculateTrustScoreV2({
      completedRides: s.completedRides,
      cancelledRides: s.cancelledRides,
      responsibleCancellations: s.responsibleCancellations,
      noShows: s.noShows,
      disputesAgainst: s.disputesAgainst,
      unpaidRides: role === 'RIDER' ? s.unpaidRides : 0,
      ratingAverage: profile.ratingAverage,
      ratingCount: profile.ratingCount,
      ratingSum: profile.ratingSum ?? null,
    });
    // v1 is kept until the cut-over. It is fed the closest equivalent of what it used to read.
    const v1 = calculateTrustScore({
      completedRides: s.completedRides + (role === 'RIDER' ? s.unpaidRides : 0),
      cancelledRides: s.cancelledRides,
      ratingAverage: profile.ratingAverage,
      ratingCount: profile.ratingCount,
      noShowsCount: Math.round(s.noShows),
      disputesCount: s.openDisputes,
    });
    return { active: this.mode === 'on' ? v2 : v1, v1, v2, stats: s };
  }

  /** Evaluates and stores the score for one user. Safe to repeat: it recomputes from source data. */
  async refresh(role: TrustRole, id: string): Promise<TrustEvaluation | null> {
    const repo = role === 'RIDER' ? this.deps.riderRepo : this.deps.driverRepo;
    const profile = await repo.findById(id);
    if (!profile) return null;
    const stats = (await this.loadStats(role, [id])).get(id);
    const evaluation = this.evaluate(role, profile, stats);

    if (this.mode === 'shadow' && evaluation.v1.score !== evaluation.v2.score) {
      logger.info(
        { role, id, v1: evaluation.v1.score, v2: evaluation.v2.score, flags: evaluation.v2.riskFlags },
        'trust score shadow difference',
      );
    }
    if (repo.saveTrust) {
      await repo.saveTrust(id, {
        score: evaluation.active.score,
        tier: evaluation.active.tier,
        breakdown: evaluation.active,
        updatedAt: this.now(),
      });
    }
    return evaluation;
  }

  /** Queues a refresh shortly after something changed. Repeated calls for one user collapse into one. */
  schedule(role: TrustRole, id: string): void {
    const key = `${role}:${id}`;
    const existing = this.pending.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.pending.delete(key);
      this.refresh(role, id).catch((err: unknown) =>
        logger.warn({ err: String(err), role, id }, 'trust score refresh failed'),
      );
    }, this.debounceMs);
    timer.unref?.();
    this.pending.set(key, timer);
  }

  /** Recomputes everyone, in pages. Used by the nightly decay sweep and the backfill script. */
  async refreshAll(
    options: { roles?: TrustRole[]; batchSize?: number; onBatch?: (n: number) => void } = {},
  ): Promise<number> {
    const roles = options.roles ?? ['RIDER', 'DRIVER'];
    const batchSize = options.batchSize ?? 100;
    let total = 0;
    for (const role of roles) {
      const repo = role === 'RIDER' ? this.deps.riderRepo : this.deps.driverRepo;
      if (!repo.listIds) continue;
      let cursor: string | null = null;
      for (;;) {
        const ids: string[] = await repo.listIds(cursor, batchSize);
        if (ids.length === 0) break;
        for (const id of ids) {
          try {
            await this.refresh(role, id);
            total += 1;
          } catch (err) {
            logger.warn({ err: String(err), role, id }, 'trust score refresh failed during sweep');
          }
        }
        options.onBatch?.(ids.length);
        cursor = ids[ids.length - 1] ?? null;
        if (ids.length < batchSize) break;
      }
    }
    return total;
  }

  /**
   * What the other party may see. Only the tier, and only once the score is public (5+ completed
   * rides). Never a number, so it is harder to game.
   */
  async getPublicTiers(role: TrustRole, ids: string[]): Promise<Map<string, PublicTrust>> {
    const out = new Map<string, PublicTrust>();
    const repo = role === 'RIDER' ? this.deps.riderRepo : this.deps.driverRepo;
    if (!repo.findManyByIds || ids.length === 0) return out;
    const profiles = await repo.findManyByIds(ids);
    for (const p of profiles) {
      const b = p.trustBreakdown;
      if (b?.isPublic && b.tier !== 'UNRATED') out.set(p.id, { tier: b.tier });
    }
    return out;
  }
}
