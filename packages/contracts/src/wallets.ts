/**
 * Driver Wallet & Ledger Contracts
 */

export const WALLET_STATUSES = ['ACTIVE', 'BLOCKED'] as const;
export type WalletStatus = (typeof WALLET_STATUSES)[number];

export const WALLET_TRANSACTION_TYPES = ['CREDIT', 'DEBIT', 'REVERSAL', 'ADJUSTMENT'] as const;
export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];

export const TRANSACTION_REFERENCE_TYPES = [
  'RIDE_COMMISSION',
  'WALLET_RECHARGE',
  'DISPUTE_REFUND',
  'ADMIN_ADJUSTMENT',
] as const;
export type TransactionReferenceType = (typeof TRANSACTION_REFERENCE_TYPES)[number];

export interface WalletDto {
  id: string;
  driverId: string;
  balancePaise: number;
  status: WalletStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransactionDto {
  id: string;
  walletId: string;
  driverId: string;
  type: WalletTransactionType;
  amountPaise: number;
  referenceType: TransactionReferenceType;
  referenceId: string | null;
  idempotencyKey: string | null;
  balanceBeforePaise: number;
  balanceAfterPaise: number;
  createdBy: string | null;
  createdAt: string;
}
