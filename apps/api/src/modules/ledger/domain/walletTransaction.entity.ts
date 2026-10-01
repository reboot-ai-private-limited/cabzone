import type {
  TransactionReferenceType,
  WalletTransactionType,
} from '@cabzone/contracts';

export interface WalletTransactionEntity {
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
  /** Free-text justification, required for admin adjustments. */
  note?: string | null;
  createdAt: Date;
}
