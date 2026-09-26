import type { WalletEntity, WalletRepositoryPort } from '../../domain/index.js';

export class MemoryWalletRepository implements WalletRepositoryPort {
  private readonly wallets = new Map<string, WalletEntity>();

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
}
