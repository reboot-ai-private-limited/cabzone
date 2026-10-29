import { describe, expect, it } from 'vitest';
import {
  parseRupeesToPaise,
  resolveCancellationPolicyDefaults,
  validateAndBuildCancellationPolicy,
} from './lib/cancellationPolicyForm';

describe('Admin Pricing Cancellation Policy Form Validation (B03 / D-044)', () => {
  it('parses integer and decimal rupee amounts accurately without float drift', () => {
    expect(parseRupeesToPaise('50')).toBe(5000);
    expect(parseRupeesToPaise('35.5')).toBe(3550);
    expect(parseRupeesToPaise('19.99')).toBe(1999);
    expect(parseRupeesToPaise('0')).toBe(0);
    expect(parseRupeesToPaise('-5')).toBeNull();
    expect(parseRupeesToPaise('12.345')).toBeNull();
    expect(parseRupeesToPaise('abc')).toBeNull();
  });

  it('populates legacy null-safe defaults when config lacks cancellation fields', () => {
    expect(resolveCancellationPolicyDefaults(undefined)).toEqual({
      cancellationFeeRupees: '50',
      driverCompensationRupees: '35',
      riderCancellationGraceSeconds: '120',
      driverNoShowWaitSeconds: '300',
    });

    expect(
      resolveCancellationPolicyDefaults({
        cancellationFeePaise: 3000,
        driverCompensationPaise: 2000,
        riderCancellationGraceSeconds: 90,
        driverNoShowWaitSeconds: 240,
      }),
    ).toEqual({
      cancellationFeeRupees: '30',
      driverCompensationRupees: '20',
      riderCancellationGraceSeconds: '90',
      driverNoShowWaitSeconds: '240',
    });
  });

  it('enforces exact cancellation split invariant and timer bounds (0..3600s)', () => {
    const valid = validateAndBuildCancellationPolicy({
      cancellationFeeRupees: '50',
      driverCompensationRupees: '35',
      riderCancellationGraceSeconds: '120',
      driverNoShowWaitSeconds: '300',
    });
    expect(valid).toEqual({
      ok: true,
      value: {
        cancellationFeePaise: 5000,
        driverCompensationPaise: 3500,
        platformCancellationFeePaise: 1500,
        riderCancellationGraceSeconds: 120,
        driverNoShowWaitSeconds: 300,
      },
    });

    const overShare = validateAndBuildCancellationPolicy({
      cancellationFeeRupees: '40',
      driverCompensationRupees: '45',
      riderCancellationGraceSeconds: '120',
      driverNoShowWaitSeconds: '300',
    });
    expect(overShare.ok).toBe(false);

    const invalidTimer = validateAndBuildCancellationPolicy({
      cancellationFeeRupees: '50',
      driverCompensationRupees: '35',
      riderCancellationGraceSeconds: '3601',
      driverNoShowWaitSeconds: '300',
    });
    expect(invalidTimer.ok).toBe(false);
  });
});
