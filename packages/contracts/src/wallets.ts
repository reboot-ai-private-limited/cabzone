/**
 * Driver Wallet & Ledger Contracts
 */

export const WALLET_OWNER_TYPES = ['DRIVER', 'RIDER', 'PLATFORM'] as const;
export type WalletOwnerType = (typeof WALLET_OWNER_TYPES)[number];

export const WALLET_STATUSES = ['ACTIVE', 'BLOCKED'] as const;
export type WalletStatus = (typeof WALLET_STATUSES)[number];

export const WALLET_TRANSACTION_TYPES = ['CREDIT', 'DEBIT', 'REVERSAL', 'ADJUSTMENT'] as const;
export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];

export const TRANSACTION_REFERENCE_TYPES = [
  'RIDE_COMMISSION',
  'WALLET_RECHARGE',
  'DISPUTE_REFUND',
  'ADMIN_ADJUSTMENT',
  'CANCELLATION_COMPENSATION',
  'CANCELLATION_FEE_ARREARS',
  'ARREARS_PAYMENT',
  'RIDER_PROMO_CREDIT',
  'RIDER_REFUND',
  'ONLINE_RIDE_EARNINGS',
  'WALLET_CASHOUT',
  'CASHOUT_REVERSAL',
] as const;
export type TransactionReferenceType = (typeof TRANSACTION_REFERENCE_TYPES)[number];

export interface WalletDto {
  id: string;
  ownerType?: WalletOwnerType | undefined;
  driverId?: string | null | undefined;
  riderId?: string | null | undefined;
  balancePaise: number;
  earningsBalancePaise?: number | undefined;
  owedPaise?: number | undefined;
  status: WalletStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WalletSummaryDto {
  id: string;
  ownerType: 'DRIVER' | 'RIDER';
  ownerId: string;
  name: string | null;
  phoneE164: string;
  email?: string | null | undefined;
  // Driver metadata
  vehicleNumber?: string | null | undefined;
  zoneName?: string | null | undefined;
  isDispatchEligible?: boolean | undefined;
  // Financial amounts matching screenshot
  balancePaise: number;
  spendableCreditPaise: number;
  owedAmountPaise: number;
  owedToCompanyPaise?: number | undefined;
  payableToDriverPaise?: number | undefined;
  lifetimeEarningsPaise?: number | undefined;
  lastEntryDate?: string | null | undefined;
  entriesCount?: number | undefined;
  isSuspended?: boolean | undefined;
  status: WalletStatus;
  updatedAt: string;
  createdAt: string;
}

export interface WalletTransactionDto {
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
  note?: string | null | undefined;
  createdAt: string;
}

export interface PaginatedWalletTransactionsDto {
  items: WalletTransactionDto[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface WalletOperationDto {
  id: string;
  driverId: string;
  kind: 'RECHARGE' | 'CASHOUT';
  status: 'CREATED' | 'PENDING' | 'COMPLETED' | 'REJECTED';
  amountPaise: number;
  rechargePaise: number;
  earningsPaise: number;
  destinationUpi: string | null;
  transferReference: string | null;
  reason: string | null;
  testMode: true;
  createdAt: string;
  updatedAt: string;
}

export interface DriverWalletActivityDto {
  commissionBalancePaise: number;
  earningsBalancePaise: number;
  availableCashoutPaise: number;
  pendingCashoutPaise: number;
  cashoutBlockedReason: string | null;
  operations: WalletOperationDto[];
  testMode: true;
}

export interface FinanceStatsDto {
  customer?:
    | {
        creditOutstandingPaise: number;
        creditCustomersCount: number;
        owedByCustomersPaise: number;
        owedCustomersCount: number;
        totalCustomersWithWallets: number;
      }
    | undefined;
  driver: {
    totalBalancePaise: number;
    activeDriversCount: number;
    blockedDriversCount: number;
    totalDriversWithWallets: number;
    // Screenshot KPI Cards
    owedToCompanyPaise?: number | undefined;
    owedDriversCount?: number | undefined;
    payableToDriversPaise?: number | undefined;
    payableDriversCount?: number | undefined;
    suspendedCount?: number | undefined;
    driversWithActivityCount?: number | undefined;
  };
  transactions: {
    totalVolumePaise: number;
    platformCommissionPaise: number;
    adjustmentsPaise: number;
    totalTransactionsCount: number;
  };
}

export interface ListWalletsQueryDto {
  type?: 'DRIVER' | 'RIDER' | undefined;
  search?: string | undefined;
  status?: 'ALL' | 'ACTIVE' | 'BLOCKED' | 'OWED' | 'CREDIT' | undefined;
  balanceFilter?: 'ALL' | 'OWING' | 'PAYABLE' | 'ZERO' | undefined;
  suspendedFilter?: 'ANY' | 'SUSPENDED' | 'NOT_SUSPENDED' | undefined;
  sortBy?: 'DEEPEST_DEBT' | 'HIGHEST_BALANCE' | 'LIFETIME_EARNINGS' | 'RECENT_ENTRY' | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface ListTransactionsQueryDto {
  walletId?: string | undefined;
  ownerId?: string | undefined;
  driverId?: string | undefined;
  riderId?: string | undefined;
  ownerType?: WalletOwnerType | undefined;
  type?: WalletTransactionType | undefined;
  types?: readonly WalletTransactionType[] | undefined;
  referenceType?: TransactionReferenceType | undefined;
  referenceTypes?: readonly TransactionReferenceType[] | undefined;
  referenceIds?: readonly string[] | undefined;
  search?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface AdjustWalletRequestDto {
  idempotencyKey?: string | undefined;
  walletId?: string | undefined;
  driverId?: string | undefined;
  riderId?: string | undefined;
  ownerType?: 'DRIVER' | 'RIDER' | undefined;
  type: 'CREDIT' | 'DEBIT';
  amountPaise: number;
  reason: string;
}
