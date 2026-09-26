import type { WalletEntity } from './wallet.entity.js';
import type { WalletTransactionEntity } from './walletTransaction.entity.js';

export interface WalletRepositoryPort {
  findByDriverId(driverId: string): Promise<WalletEntity | null>;
  save(wallet: WalletEntity): Promise<WalletEntity>;
  recordTransaction(transaction: WalletTransactionEntity): Promise<WalletTransactionEntity>;
  findTransactionsByWalletId(walletId: string): Promise<WalletTransactionEntity[]>;
}
