import type {
  WalletEntity,
  WalletRepositoryPort,
  WalletTransactionEntity,
} from '../../domain/index.js';

export class MemoryWalletRepository implements WalletRepositoryPort {
  private readonly wallets = new Map<string, WalletEntity>();
  private readonly transactions: WalletTransactionEntity[] = [];

  async findByDriverId(driverId: string): Promise<WalletEntity | null> {
    for (const wallet of this.wallets.values()) {
      if (wallet.driverId === driverId) {
        return { ...wallet };
      }
    }
    return null;
  }

  async save(wallet: WalletEntity): Promise<WalletEntity> {
    this.wallets.set(wallet.id, { ...wallet, updatedAt: new Date() });
    return { ...this.wallets.get(wallet.id)! };
  }

  async recordTransaction(
    transaction: WalletTransactionEntity,
  ): Promise<WalletTransactionEntity> {
    const copy = { ...transaction };
    this.transactions.push(copy);
    return { ...copy };
  }

  async findTransactionsByWalletId(
    walletId: string,
  ): Promise<WalletTransactionEntity[]> {
    return this.transactions
      .filter((t) => t.walletId === walletId)
      .map((t) => ({ ...t }));
  }
}
