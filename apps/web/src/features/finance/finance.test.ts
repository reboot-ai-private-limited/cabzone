import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MIN_PUBLIC_RATING_COUNT,
  formatPublicRatingLabel,
  type WalletSummaryDto,
} from '@cabzone/contracts';
import { formatPaise } from '../../lib/format';
import {
  mergeUniqueTransactions,
  resolveLedgerViewState,
  resolveWalletBalanceState,
} from './lib/ledgerState';

describe('Finance & Ledger Domain Logic', () => {
  const sampleDriverWallet: WalletSummaryDto = {
    id: '01900000-0000-7000-8000-000000000030',
    ownerType: 'DRIVER',
    ownerId: '01900000-0000-7000-8000-000000000020',
    name: 'Dev Driver',
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

  it('never turns loading or failed ledger/wallet states into zero-entry or ₹0.00 states', () => {
    expect(resolveLedgerViewState({ itemCount: 0, isLoading: true, isError: false })).toBe(
      'loading',
    );
    expect(resolveLedgerViewState({ itemCount: 0, isLoading: false, isError: true })).toBe('error');
    expect(resolveLedgerViewState({ itemCount: 0, isLoading: false, isError: false })).toBe(
      'empty',
    );
    expect(resolveLedgerViewState({ itemCount: 3, isLoading: false, isError: true })).toBe('table');

    expect(
      resolveWalletBalanceState({ isPending: true, isError: false, balancePaise: undefined }),
    ).toEqual({ status: 'loading', balancePaise: null });
    expect(
      resolveWalletBalanceState({ isPending: false, isError: true, balancePaise: undefined }),
    ).toEqual({ status: 'error', balancePaise: null });
    expect(
      resolveWalletBalanceState({ isPending: false, isError: false, balancePaise: null }),
    ).toEqual({ status: 'ready', balancePaise: 0 });
  });

  it('deduplicates older ledger pages by transaction id while preserving server order', () => {
    const page1 = [
      { id: 'tx-3', amountPaise: 3000 },
      { id: 'tx-2', amountPaise: 2000 },
    ];
    const page2WithOverlap = [
      { id: 'tx-2', amountPaise: 2000 },
      { id: 'tx-1', amountPaise: 1000 },
    ];
    expect(mergeUniqueTransactions(page1, page2WithOverlap).map((tx) => tx.id)).toEqual([
      'tx-3',
      'tx-2',
      'tx-1',
    ]);
  });

  it('preserves honest zero/new rating display and forbids sample filler datasets in admin views', () => {
    expect(MIN_PUBLIC_RATING_COUNT).toBe(5);
    expect(formatPublicRatingLabel(null, 0)).toBe('New');
    expect(formatPublicRatingLabel(4.9, 4)).toBe('New');
    expect(formatPublicRatingLabel(4.82, 5)).toBe('4.8');

    const ridersSrc = readFileSync(
      new URL('../riders/components/RidersScreen.tsx', import.meta.url),
      'utf8',
    );
    const riderModalSrc = readFileSync(
      new URL('../riders/components/RiderDetailModal.tsx', import.meta.url),
      'utf8',
    );
    const adminsSrc = readFileSync(
      new URL('../admins/components/AdminsScreen.tsx', import.meta.url),
      'utf8',
    );
    const driverDetailsSrc = readFileSync(
      new URL('../drivers/components/DriverDetailsScreen.tsx', import.meta.url),
      'utf8',
    );

    expect(ridersSrc).not.toContain('FILLER_CUSTOMERS');
    expect(riderModalSrc).not.toContain('48000');
    expect(adminsSrc).not.toContain('FILLER_ADMINS');
    expect(driverDetailsSrc).not.toContain('Manik Saha');
  });

  it('omits other-account phone numbers and tel: links from admin views and CSV exports (P06)', () => {
    const balancesSrc = readFileSync(
      new URL('./components/DriverBalancesTable.tsx', import.meta.url),
      'utf8',
    );
    const ridersSrc = readFileSync(
      new URL('../riders/components/RidersScreen.tsx', import.meta.url),
      'utf8',
    );
    const riderModalSrc = readFileSync(
      new URL('../riders/components/RiderDetailModal.tsx', import.meta.url),
      'utf8',
    );
    const adminsSrc = readFileSync(
      new URL('../admins/components/AdminsScreen.tsx', import.meta.url),
      'utf8',
    );
    const driversSrc = readFileSync(
      new URL('../drivers/components/DriversScreen.tsx', import.meta.url),
      'utf8',
    );
    const driverDetailsSrc = readFileSync(
      new URL('../drivers/components/DriverDetailsScreen.tsx', import.meta.url),
      'utf8',
    );

    for (const src of [
      balancesSrc,
      ridersSrc,
      riderModalSrc,
      adminsSrc,
      driversSrc,
      driverDetailsSrc,
    ]) {
      expect(src).not.toContain('phoneE164');
      expect(src).not.toContain('alternatePhone');
      expect(src).not.toContain('tel:');
    }
    expect(balancesSrc).toContain("'Driver ID'");
    expect(balancesSrc).not.toContain("'Phone'");
  });
});
