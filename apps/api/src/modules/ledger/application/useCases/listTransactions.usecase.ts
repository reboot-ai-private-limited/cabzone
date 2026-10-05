import type { ListTransactionsQueryDto, WalletTransactionDto } from '@cabzone/contracts';
import type { WalletRepositoryPort } from '../../domain/index.js';

export interface ListTransactionsResult {
  items: WalletTransactionDto[];
  total: number;
}

export class ListTransactionsUseCase {
  constructor(private readonly walletRepo: WalletRepositoryPort) {}

  async execute(query: ListTransactionsQueryDto): Promise<ListTransactionsResult> {
    return this.walletRepo.listTransactions(query);
  }
}
