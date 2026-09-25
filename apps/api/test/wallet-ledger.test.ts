import { describe, expect, it } from 'vitest';
import {
  adminAdjustWalletSchema,
  calculateNewBalance,
  isDriverEligibleForNewRides,
  isPaymentSettled,
  isWalletActive,
  PaymentEventModel,
  PaymentModel,
  rechargeWalletSchema,
  recordPaymentSchema,
  WalletModel,
  WalletTransactionModel,
  type PaymentEntity,
  type WalletEntity,
} from '../src/modules/ledger/index.js';

describe('Wallet Domain Invariants', () => {
  const activeWallet: WalletEntity = {
    id: '018f0a00-0000-7000-8000-000000000001',
    driverId: '018f0a00-0000-7000-8000-000000000010',
    balancePaise: 50000, // Rs. 500
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('identifies active wallet status', () => {
    expect(isWalletActive(activeWallet)).toBe(true);
    expect(isWalletActive({ ...activeWallet, status: 'BLOCKED' })).toBe(false);
  });

  it('determines driver ride eligibility based on minimum balance (D-026)', () => {
    // Non-negative balance is eligible
    expect(isDriverEligibleForNewRides(activeWallet)).toBe(true);

    // Exactly zero balance is eligible
    expect(isDriverEligibleForNewRides({ ...activeWallet, balancePaise: 0 })).toBe(true);

    // Negative balance is ineligible for new rides
    expect(isDriverEligibleForNewRides({ ...activeWallet, balancePaise: -500 })).toBe(false);

    // Blocked wallet is ineligible regardless of balance
    expect(isDriverEligibleForNewRides({ ...activeWallet, status: 'BLOCKED' })).toBe(false);
  });

  it('calculates new balance correctly for transaction types', () => {
    expect(calculateNewBalance(10000, 5000, 'CREDIT')).toBe(15000);
    expect(calculateNewBalance(10000, 3000, 'DEBIT')).toBe(7000);
    expect(calculateNewBalance(10000, 2000, 'REVERSAL')).toBe(12000);
    expect(calculateNewBalance(10000, 4000, 'ADJUSTMENT')).toBe(6000);
  });
});

describe('Payment Domain Invariants', () => {
  const confirmedPayment: PaymentEntity = {
    id: '018f0a00-0000-7000-8000-000000000002',
    rideId: '018f0a00-0000-7000-8000-000000000020',
    payerRiderId: '018f0a00-0000-7000-8000-000000000030',
    method: 'UPI',
    amountPaise: 25000,
    status: 'CONFIRMED',
    provider: 'CASHFREE',
    providerPaymentId: 'cf_pay_123',
    confirmedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('identifies confirmed payment as settled', () => {
    expect(isPaymentSettled(confirmedPayment)).toBe(true);
    expect(isPaymentSettled({ ...confirmedPayment, status: 'PENDING' })).toBe(false);
    expect(isPaymentSettled({ ...confirmedPayment, status: 'FAILED' })).toBe(false);
  });
});

describe('Ledger Boundary Validations (Zod Schemas)', () => {
  it('validates rechargeWallet payload with minimum Rs. 100 constraint', () => {
    const valid = {
      driverId: '018f0a00-0000-7000-8000-000000000010',
      amountPaise: 50000, // Rs. 500
    };
    expect(rechargeWalletSchema.safeParse(valid).success).toBe(true);

    // Below Rs. 100 (10000 paise)
    expect(rechargeWalletSchema.safeParse({ ...valid, amountPaise: 5000 }).success).toBe(false);
  });

  it('validates adminAdjustWallet payload', () => {
    const valid = {
      driverId: '018f0a00-0000-7000-8000-000000000010',
      amountPaise: 1500,
      type: 'CREDIT' as const,
      reason: 'Dispute resolution refund',
    };
    expect(adminAdjustWalletSchema.safeParse(valid).success).toBe(true);

    // Short reason
    expect(adminAdjustWalletSchema.safeParse({ ...valid, reason: 'bad' }).success).toBe(false);
  });

  it('validates recordPayment payload', () => {
    const valid = {
      rideId: '018f0a00-0000-7000-8000-000000000020',
      payerRiderId: '018f0a00-0000-7000-8000-000000000030',
      method: 'CASH' as const,
      amountPaise: 35000,
    };
    expect(recordPaymentSchema.safeParse(valid).success).toBe(true);

    // Negative amount
    expect(recordPaymentSchema.safeParse({ ...valid, amountPaise: -100 }).success).toBe(false);
  });
});

describe('Mongoose Persistence Models', () => {
  it('registers ledger and payment models with correct collection names', () => {
    expect(WalletModel.collection.name).toBe('wallets');
    expect(WalletTransactionModel.collection.name).toBe('wallet_transactions');
    expect(PaymentModel.collection.name).toBe('payments');
    expect(PaymentEventModel.collection.name).toBe('payment_events');
  });
});
