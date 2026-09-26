import type { WalletEntity } from './wallet.entity.js';

export interface WalletRepositoryPort {
  findByDriverId(driverId: string): Promise<WalletEntity | null>;
  save(wallet: WalletEntity): Promise<WalletEntity>;
}
