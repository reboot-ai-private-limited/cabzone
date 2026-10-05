import { describe, expect, it } from 'vitest';
import { calculateTrustScore } from '../src/modules/identity/domain/trustScore.calculator.js';

describe('Trust Score Calculation Engine (Decision D-021, PRD §5.7)', () => {
  it('enforces cold-start threshold: returns UNRATED / null when total trips < 3', () => {
    const result = calculateTrustScore({
      completedRides: 1,
      cancelledRides: 1,
      ratingAverage: 5.0,
      ratingCount: 1,
    });

    expect(result.score).toBeNull();
    expect(result.tier).toBe('UNRATED');
    expect(result.isPreliminary).toBe(true);
    expect(result.summary).toContain('Requires at least 3');
  });

  it('calculates EXCELLENT trust score for high ratings, 0 cancellations, and good volume', () => {
    const result = calculateTrustScore({
      completedRides: 25,
      cancelledRides: 0,
      ratingAverage: 4.9,
      ratingCount: 20,
    });

    expect(result.score).toBeGreaterThanOrEqual(95);
    expect(result.tier).toBe('EXCELLENT');
    expect(result.isPreliminary).toBe(false);
  });

  it('penalizes frequent cancellations (> 5% cancellation rate)', () => {
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

    expect(highCancelResult.score).toBeDefined();
    expect(lowCancelResult.score).toBeDefined();
    expect(highCancelResult.score!).toBeLessThan(lowCancelResult.score!);
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
    // Horrendous metrics
    const terrible = calculateTrustScore({
      completedRides: 5,
      cancelledRides: 20,
      ratingAverage: 1.0,
      ratingCount: 20,
      disputesCount: 10,
    });
    expect(terrible.score).toBe(10);
    expect(terrible.tier).toBe('POOR');

    // Superhuman metrics
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
});
