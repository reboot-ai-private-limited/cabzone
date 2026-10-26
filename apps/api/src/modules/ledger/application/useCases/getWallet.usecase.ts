import type {
  WalletEntity,
  WalletRepositoryPort,
  WalletTransactionEntity,
} from '../../domain/index.js';

export interface WalletView {
  wallet: WalletEntity | null;
  transactions: WalletTransactionEntity[];
}

/** A driver with no wallet yet reads as an empty one rather than an error. */
export class GetWalletUseCase {
  constructor(private readonly walletRepo: WalletRepositoryPort) {}

  async execute(driverId: string, txLimit?: number): Promise<WalletView> {
    const wallet = await this.walletRepo.findByDriverId(driverId);
    if (!wallet) return { wallet: null, transactions: [] };
    return {
      wallet,
      transactions: await this.walletRepo.findTransactionsByWalletId(wallet.id, txLimit),
    };
  }
}
