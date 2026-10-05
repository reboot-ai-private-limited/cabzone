import { describe, expect, it } from 'vitest';
import type { WalletSummaryDto } from '@cabzone/contracts';
import { formatPaise } from '../../lib/format';

describe('Finance & Ledger Domain Logic', () => {
  const sampleDriverWallet: WalletSummaryDto = {
    id: '01900000-0000-7000-8000-000000000030',
    ownerType: 'DRIVER',
    ownerId: '01900000-0000-7000-8000-000000000020',
    name: 'Dev Driver',
    phoneE164: '+919000000002',
    vehicleNumber: 'WB74A1234',
    zoneName: 'Siliguri City',
    spendableCreditPaise: 0,
    owedAmountPaise: 27500,
    owedToCompanyPaise: 27500,
    payableToDriverPaise: 0,
    lifetimeEarningsPaise: 115000,
    lastEntryDate: '2026-10-03T10:00:00Z',
    entriesCount: 6,
    balancePaise: -27500, // -₹275
    isDispatchEligible: false,
    isSuspended: false,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('formats rupees and paise correctly for driver balances and debt', () => {
    expect(formatPaise(sampleDriverWallet.owedToCompanyPaise ?? 0)).toBe('₹275.00');
    expect(formatPaise(sampleDriverWallet.lifetimeEarningsPaise ?? 0)).toBe('₹1,150.00');
    expect(formatPaise(52000)).toBe('₹520.00');
    expect(formatPaise(0)).toBe('₹0.00');
  });

  it('enforces Decision D-008: driver requires positive balance for dispatch eligibility', () => {
    expect(sampleDriverWallet.balancePaise > 0).toBe(false);
    expect(sampleDriverWallet.isDispatchEligible).toBe(false);

    const positiveDriver: WalletSummaryDto = {
      ...sampleDriverWallet,
      balancePaise: 50000,
      isDispatchEligible: true,
    };
    expect(positiveDriver.isDispatchEligible).toBe(true);

    const zeroBalanceDriver: WalletSummaryDto = {
      ...sampleDriverWallet,
      balancePaise: 0,
      isDispatchEligible: false,
    };
    expect(zeroBalanceDriver.isDispatchEligible).toBe(false);
  });

  it('correctly maps screenshot financial attributes', () => {
    expect(sampleDriverWallet.owedToCompanyPaise).toBe(27500);
    expect(sampleDriverWallet.payableToDriverPaise).toBe(0);
    expect(sampleDriverWallet.lifetimeEarningsPaise).toBe(115000);
    expect(sampleDriverWallet.entriesCount).toBe(6);
    expect(sampleDriverWallet.isSuspended).toBe(false);
  });
});
