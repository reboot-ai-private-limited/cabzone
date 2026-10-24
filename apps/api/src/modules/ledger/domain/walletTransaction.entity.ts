import type {
  TransactionReferenceType,
  WalletOwnerType,
  WalletTransactionType,
} from '@cabzone/contracts';

export interface WalletTransactionEntity {
  bucket?: 'COMMISSION' | 'EARNINGS' | undefined;
  id: string;
  walletId: string;
  ownerType?: WalletOwnerType | undefined;
  ownerId?: string | undefined;
  driverId?: string | null | undefined;
  riderId?: string | null | undefined;
  type: WalletTransactionType;
  amountPaise: number;
  referenceType: TransactionReferenceType;
  referenceId: string | null;
  idempotencyKey: string | null;
  balanceBeforePaise: number;
  balanceAfterPaise: number;
  createdBy: string | null;
  /** Free-text justification, required for admin adjustments. */
  note?: string | null | undefined;
  createdAt: Date;
}

