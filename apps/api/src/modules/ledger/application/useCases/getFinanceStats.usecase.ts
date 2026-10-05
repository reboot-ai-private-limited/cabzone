import type { FinanceStatsDto } from '@cabzone/contracts';
import type { WalletRepositoryPort } from '../../domain/index.js';

export class GetFinanceStatsUseCase {
  constructor(private readonly walletRepo: WalletRepositoryPort) {}

  async execute(): Promise<FinanceStatsDto> {
    return this.walletRepo.getStats();
  }
}
