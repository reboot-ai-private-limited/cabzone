import { describe, expect, it } from 'vitest';
import { formatPublicRatingLabel } from '@cabzone/contracts';
import { calculateTrustScore } from '../src/modules/identity/domain/trustScore.calculator.js';

describe('Trust Score Calculation Engine & Public Rating Thresholds (D-021, D-046, OQ-018)', () => {
  it('enforces 5-completed-ride public threshold: returns UNRATED / null when completedRides < 5', () => {
    const result = calculateTrustScore({
      completedRides: 4,
      cancelledRides: 2,
      ratingAverage: 5.0,
      ratingCount: 4,
    });

    expect(result.score).toBeNull();
    expect(result.tier).toBe('UNRATED');
    expect(result.isPreliminary).toBe(true);
    expect(result.isPublic).toBe(false);
    expect(result.summary).toContain('Requires at least 5 completed rides');
  });

  it('never infers a fabricated 5.0 rating average when ratingCount === 0', () => {
    const unratedButFabricatedAvg = calculateTrustScore({
      completedRides: 6,
      cancelledRides: 0,
      ratingAverage: 5.0,
      ratingCount: 0,
    });

    expect(unratedButFabricatedAvg.factors.ratingAverage).toBeNull();
    // Without >= 5 real revealed ratings, should NOT earn the +5 elite rating bonus on top of 100
    const withLowVolume = calculateTrustScore({
      completedRides: 6,
      cancelledRides: 1, // ~14.3% cancellation -> -9 pts => 91 without bonus
      ratingAverage: 5.0,
      ratingCount: 0,
    });
    const withVerifiedElite = calculateTrustScore({
      completedRides: 6,
      cancelledRides: 1,
      ratingAverage: 5.0,
      ratingCount: 5, // >= 5 revealed ratings -> earns +5 elite bonus => 96
    });
    expect(withVerifiedElite.score!).toBe(withLowVolume.score! + 5);
  });

  it('calculates EXCELLENT trust score for >= 5 revealed high ratings, 0 cancellations, and good volume', () => {
    const result = calculateTrustScore({
      completedRides: 25,
      cancelledRides: 0,
      ratingAverage: 4.9,
      ratingCount: 20,
    });

    expect(result.score).toBeGreaterThanOrEqual(95);
    expect(result.tier).toBe('EXCELLENT');
    expect(result.isPreliminary).toBe(false);
    expect(result.isPublic).toBe(true);
  });

  it('penalizes frequent cancellations (> 5% cancellation rate) and no-shows (-10 pts per no-show)', () => {
    const highCancelResult = calculateTrustScore({
      completedRides: 10,
      cancelledRides: 5, // 33% cancellation
      ratingAverage: 4.5,
      ratingCount: 8,
    });

    const lowCancelResult = calculateTrustScore({
      completedRides: 15,
      cancelledRides: 0,
      ratingAverage: 4.5,
      ratingCount: 12,
    });

    const noShowResult = calculateTrustScore({
      completedRides: 10,
      cancelledRides: 5,
      noShowsCount: 2, // additional -20 pts
      ratingAverage: 4.5,
      ratingCount: 8,
    });

    expect(highCancelResult.score!).toBeLessThan(lowCancelResult.score!);
    expect(noShowResult.score!).toBe(highCancelResult.score! - 20);
  });

  it('penalizes disputes and safety complaints heavily (-15 pts per incident)', () => {
    const cleanResult = calculateTrustScore({
      completedRides: 30,
      cancelledRides: 1,
      ratingAverage: 4.1,
      ratingCount: 25,
      disputesCount: 0,
    });

    const disputeResult = calculateTrustScore({
      completedRides: 30,
      cancelledRides: 1,
      ratingAverage: 4.1,
      ratingCount: 25,
      disputesCount: 2, // -30 pts
    });

    expect(disputeResult.score!).toBe(cleanResult.score! - 30);
  });

  it('clamps scores strictly between 10 and 100', () => {
    const terrible = calculateTrustScore({
      completedRides: 5,
      cancelledRides: 20,
      ratingAverage: 1.0,
      ratingCount: 20,
      disputesCount: 10,
      noShowsCount: 4,
    });
    expect(terrible.score).toBe(10);
    expect(terrible.tier).toBe('POOR');

    const perfect = calculateTrustScore({
      completedRides: 500,
      cancelledRides: 0,
      ratingAverage: 5.0,
      ratingCount: 450,
      disputesCount: 0,
    });
    expect(perfect.score).toBe(100);
    expect(perfect.tier).toBe('EXCELLENT');
  });

  it('formatPublicRatingLabel returns "New" until ratingCount >= 5 and never fabricates 5.0', () => {
    expect(formatPublicRatingLabel(null, 0)).toBe('New');
    expect(formatPublicRatingLabel(5.0, 0)).toBe('New');
    expect(formatPublicRatingLabel(4.9, 1)).toBe('New');
    expect(formatPublicRatingLabel(4.8, 4)).toBe('New');
    expect(formatPublicRatingLabel(4.8, 5)).toBe('4.8');
    expect(formatPublicRatingLabel(4.75, 12, 2)).toBe('4.75');
  });
});
