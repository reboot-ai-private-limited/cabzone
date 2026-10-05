import { describe, expect, it } from 'vitest';
import { isReviewable, REVIEWABLE } from './StatusBadge';

describe('Driver StatusBadge helpers', () => {
  it('correctly marks submitted applications as reviewable', () => {
    expect(isReviewable('SUBMITTED')).toBe(true);
    expect(isReviewable('UNDER_REVIEW_AUTO')).toBe(true);
    expect(isReviewable('UNDER_REVIEW_ADMIN')).toBe(true);
    expect(isReviewable('REAPPLIED')).toBe(true);
  });

  it('correctly marks finalized applications as non-reviewable', () => {
    expect(isReviewable('APPROVED')).toBe(false);
    expect(isReviewable('REJECTED')).toBe(false);
    expect(isReviewable('DRAFT')).toBe(false);
  });

  it('REVIEWABLE set has exact size of active review states', () => {
    expect(REVIEWABLE.size).toBe(4);
    expect(Array.from(REVIEWABLE)).toEqual(
      expect.arrayContaining(['SUBMITTED', 'UNDER_REVIEW_AUTO', 'UNDER_REVIEW_ADMIN', 'REAPPLIED']),
    );
  });
});
