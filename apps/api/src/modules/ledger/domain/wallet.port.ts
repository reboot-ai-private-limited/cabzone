import type {
  FinanceStatsDto,
  ListTransactionsQueryDto,
  ListWalletsQueryDto,
  WalletSummaryDto,
  WalletTransactionDto,
} from '@cabzone/contracts';
import type { WalletEntity } from './wallet.entity.js';
import type { WalletTransactionEntity } from './walletTransaction.entity.js';

export interface UserLookupItem {
  id: string;
  name: string | null;
  phoneE164: string;
  email?: string | null | undefined;
  vehicleNumber?: string | null | undefined;
  zoneName?: string | null | undefined;
}

export interface WalletRepositoryPort {
  findByDriverId(driverId: string): Promise<WalletEntity | null>;
  findByRiderId(riderId: string): Promise<WalletEntity | null>;
  findById(id: string): Promise<WalletEntity | null>;
  findAllWallets?(driverId?: string): Promise<WalletEntity[]>;
  save(wallet: WalletEntity): Promise<WalletEntity>;
  recordTransaction(transaction: WalletTransactionEntity): Promise<WalletTransactionEntity>;
  findTransactionsByWalletId(walletId: string, limit?: number): Promise<WalletTransactionEntity[]>;
  findTransactionByIdempotencyKey(key: string): Promise<WalletTransactionEntity | null>;
  listWallets(
    query: ListWalletsQueryDto,
    lookups?: {
      getDrivers?: () => Promise<UserLookupItem[]>;
      getRiders?: () => Promise<UserLookupItem[]>;
    },
  ): Promise<{ items: WalletSummaryDto[]; total: number }>;
  listTransactions(
    query: ListTransactionsQueryDto,
  ): Promise<{ items: WalletTransactionDto[]; total: number }>;
  getStats(): Promise<FinanceStatsDto>;
}
