import type { ListWalletsQueryDto, WalletSummaryDto } from '@cabzone/contracts';
import type { UserLookupItem, WalletRepositoryPort } from '../../domain/index.js';

export interface ListWalletsResult {
  items: WalletSummaryDto[];
  total: number;
}

export class ListWalletsUseCase {
  constructor(
    private readonly walletRepo: WalletRepositoryPort,
    private readonly lookups?: {
      getDrivers?: () => Promise<UserLookupItem[]>;
      getRiders?: () => Promise<UserLookupItem[]>;
    },
  ) {}

  async execute(query: ListWalletsQueryDto): Promise<ListWalletsResult> {
    return this.walletRepo.listWallets(query, this.lookups);
  }
}
