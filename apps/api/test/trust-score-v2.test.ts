import { describe, expect, it } from 'vitest';
import { calculateTrustScoreV2, type TrustScoreInputV2 } from '../src/modules/identity/domain/index.js';

const base: TrustScoreInputV2 = {
  completedRides: 10,
  responsibleCancellations: 0,
  noShows: 0,
  disputesAgainst: 0,
  unpaidRides: 0,
  ratingAverage: null,
  ratingCount: 0,
};

const score = (over: Partial<TrustScoreInputV2>) => calculateTrustScoreV2({ ...base, ...over });

describe('Trust score v2 (D-048)', () => {
  describe('public threshold and early flags', () => {
    it('hides the score below 5 completed rides', () => {
      const r = score({ completedRides: 4 });
      expect(r.score).toBeNull();
      expect(r.tier).toBe('UNRATED');
      expect(r.isPublic).toBe(false);
      expect(r.riskFlags).toEqual([]);
    });

    it('flags a cancel pattern while still hidden (F5)', () => {
      const r = score({ completedRides: 4, responsibleCancellations: 40 });
      expect(r.score).toBeNull();
      expect(r.riskFlags).toContain('EARLY_CANCEL_PATTERN');
    });

    it('does not flag cancellations nobody caused', () => {
      // 40 cancels from drivers or the system arrive here as responsibleCancellations = 0
      const r = score({ completedRides: 4, responsibleCancellations: 0 });
      expect(r.riskFlags).toEqual([]);
    });

    it('flags unpaid rides and disputes lost before the score is public', () => {
      const r = score({ completedRides: 2, unpaidRides: 1, disputesAgainst: 1 });
      expect(r.riskFlags).toEqual(expect.arrayContaining(['EARLY_UNPAID', 'EARLY_DISPUTE']));
    });
  });

  describe('ratings (F2, F7, F13)', () => {
    it('does not hand an unrated user a perfect score', () => {
      const r = score({ completedRides: 5 });
      expect(r.score).toBe(89);
      expect(r.tier).toBe('GOOD');
      expect(r.confidence).toBe('PROVISIONAL');
    });

    it('a single 1-star rating costs a few points, not the whole score', () => {
      const r = score({ completedRides: 5, ratingAverage: 1, ratingCount: 1 });
      expect(r.score).toBe(85);
      expect(r.tier).toBe('GOOD');
    });

    it('a single 5-star rating cannot reach EXCELLENT', () => {
      const r = score({ completedRides: 5, ratingAverage: 5, ratingCount: 1 });
      expect(r.score).toBe(89);
    });

    it('five ratings of 4.9 unlock EXCELLENT', () => {
      const r = score({ completedRides: 10, ratingAverage: 4.9, ratingCount: 5 });
      expect(r.score).toBe(100);
      expect(r.tier).toBe('EXCELLENT');
      expect(r.confidence).toBe('VERIFIED');
    });

    it('uses the exact rating sum when it is available', () => {
      const r = score({ completedRides: 10, ratingAverage: null, ratingCount: 4, ratingSum: 16 });
      expect(r.factors.ratingAverage).toBe(4);
    });

    it('treats a NaN or out-of-range average as no rating', () => {
      for (const ratingAverage of [Number.NaN, 0, 9, -1]) {
        const r = score({ completedRides: 10, ratingAverage, ratingCount: 3 });
        expect(r.factors.ratingCount).toBe(0);
        expect(r.factors.ratingAverage).toBeNull();
        expect(r.score).toBe(89);
      }
    });

    it('penalises a consistently low average', () => {
      const r = score({ completedRides: 30, ratingAverage: 3, ratingCount: 30 });
      // effective = (22.5 + 90) / 35 = 3.214; penalty = round(1.286 * 25) = 32; +2 experience
      expect(r.score).toBe(70);
      expect(r.tier).toBe('FAIR');
    });
  });

  describe('penalties', () => {
    it('ignores cancellations up to 5 percent and penalises beyond', () => {
      const ok = score({ completedRides: 95, responsibleCancellations: 5, ratingAverage: 4.6, ratingCount: 20 });
      expect(ok.factors.completionRate).toBe(0.95);
      const bad = score({ completedRides: 80, responsibleCancellations: 20, ratingAverage: 4.6, ratingCount: 20 });
      expect(bad.score!).toBeLessThan(ok.score!);
    });

    it('takes 10 points per no-show and 10 per unpaid ride', () => {
      const clean = score({ completedRides: 10, ratingAverage: 4.6, ratingCount: 10 });
      // A no-show is also a responsible cancellation: -10 for the no-show, plus the rate penalty
      // (1 of 11 attempts = 9.1%, 4.1 points over the 5% allowance, rounded to 4).
      expect(
        score({
          completedRides: 10,
          ratingAverage: 4.6,
          ratingCount: 10,
          noShows: 1,
          responsibleCancellations: 1,
        }).score,
      ).toBe(clean.score! - 10 - 4);
      // unpaid rides do not count as completed rides, so use a separate clean base
      expect(score({ completedRides: 10, ratingAverage: 4.6, ratingCount: 10, unpaidRides: 2 }).score).toBe(
        clean.score! - 20,
      );
    });

    it('a dispute lost blocks EXCELLENT even for veterans (F8)', () => {
      const r = score({
        completedRides: 50,
        ratingAverage: 4.9,
        ratingCount: 20,
        disputesAgainst: 1,
      });
      expect(r.score).toBe(89);
      expect(r.tier).toBe('GOOD');
    });

    it('lets the cap lift as the dispute decays below half weight', () => {
      const r = score({
        completedRides: 50,
        ratingAverage: 4.9,
        ratingCount: 20,
        disputesAgainst: 0.4,
      });
      // 100 + 5 elite - 6 dispute + 2.5 experience (halved) = 101.5, clamped to 100
      expect(r.score).toBe(100);
      expect(r.tier).toBe('EXCELLENT');
    });
  });

  describe('invariants', () => {
    const profiles: Partial<TrustScoreInputV2>[] = [
      {},
      { ratingAverage: 4.8, ratingCount: 12 },
      { ratingAverage: 2.5, ratingCount: 30, completedRides: 60 },
      { completedRides: 200, ratingAverage: 5, ratingCount: 100 },
    ];

    it('always stays inside 10..100', () => {
      for (const p of profiles) {
        for (const noShows of [0, 3, 50]) {
          const r = score({ ...p, noShows, responsibleCancellations: noShows, disputesAgainst: noShows });
          if (r.score !== null) {
            expect(r.score).toBeGreaterThanOrEqual(10);
            expect(r.score).toBeLessThanOrEqual(100);
          }
        }
      }
    });

    it('adding a penalty never raises the score', () => {
      for (const p of profiles) {
        const before = score(p).score!;
        for (const extra of [
          { responsibleCancellations: 2 },
          { noShows: 1 },
          { disputesAgainst: 1 },
          { unpaidRides: 1 },
        ]) {
          expect(score({ ...p, ...extra }).score!).toBeLessThanOrEqual(before);
        }
      }
    });

    it('a better rating never lowers the score', () => {
      const low = score({ completedRides: 20, ratingAverage: 3.5, ratingCount: 10 }).score!;
      const mid = score({ completedRides: 20, ratingAverage: 4.4, ratingCount: 10 }).score!;
      const high = score({ completedRides: 20, ratingAverage: 4.9, ratingCount: 10 }).score!;
      expect(low).toBeLessThanOrEqual(mid);
      expect(mid).toBeLessThanOrEqual(high);
    });

    it('tier boundaries', () => {
      expect(score({ completedRides: 10, ratingAverage: 4.9, ratingCount: 10 }).tier).toBe('EXCELLENT');
      expect(score({ completedRides: 10, responsibleCancellations: 6, ratingAverage: 4.6, ratingCount: 10 }).tier).toBe(
        'FAIR',
      );
    });
  });
});
