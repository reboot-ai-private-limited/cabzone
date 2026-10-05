import type { RequestHandler, Router } from 'express';
import type { AuthRole } from '@cabzone/contracts';
import { AdminAdjustWalletUseCase } from './application/useCases/adminAdjustWallet.usecase.js';
import { GetFinanceStatsUseCase } from './application/useCases/getFinanceStats.usecase.js';
import { GetWalletUseCase } from './application/useCases/getWallet.usecase.js';
import { ListTransactionsUseCase } from './application/useCases/listTransactions.usecase.js';
import { ListWalletsUseCase } from './application/useCases/listWallets.usecase.js';
import type { UserLookupItem, WalletRepositoryPort } from './domain/index.js';
import {
  makeAdminAdjustWalletController,
  makeAdminGetFinanceStatsController,
  makeAdminGetWalletController,
  makeAdminListTransactionsController,
  makeAdminListWalletsController,
  makeMyWalletController,
} from './interface/ledger.controller.js';
import { buildAdminWalletRouter, buildDriverWalletRouter } from './interface/ledger.routes.js';

export interface LedgerLookups {
  getDrivers?: () => Promise<UserLookupItem[]>;
  getRiders?: () => Promise<UserLookupItem[]>;
}

export interface LedgerContainerDeps {
  walletRepo: WalletRepositoryPort;
  resolveDriverId: (userId: string) => Promise<string | null>;
  lookups?: LedgerLookups;
}

export interface LedgerAuth {
  authenticate: RequestHandler;
  requireRole: (...roles: AuthRole[]) => RequestHandler;
}

export interface LedgerContainer {
  walletRepo: WalletRepositoryPort;
  adminAdjustWalletUseCase: AdminAdjustWalletUseCase;
  getWalletUseCase: GetWalletUseCase;
  listWalletsUseCase: ListWalletsUseCase;
  listTransactionsUseCase: ListTransactionsUseCase;
  getFinanceStatsUseCase: GetFinanceStatsUseCase;
  buildAdminWalletRouter: (auth: LedgerAuth) => Router;
  buildDriverWalletRouter: (auth: LedgerAuth) => Router;
}

export function buildLedgerContainer(deps: LedgerContainerDeps): LedgerContainer {
  const adminAdjustWalletUseCase = new AdminAdjustWalletUseCase(deps.walletRepo);
  const getWalletUseCase = new GetWalletUseCase(deps.walletRepo);
  const listWalletsUseCase = new ListWalletsUseCase(deps.walletRepo, deps.lookups);
  const listTransactionsUseCase = new ListTransactionsUseCase(deps.walletRepo);
  const getFinanceStatsUseCase = new GetFinanceStatsUseCase(deps.walletRepo);

  return {
    walletRepo: deps.walletRepo,
    adminAdjustWalletUseCase,
    getWalletUseCase,
    listWalletsUseCase,
    listTransactionsUseCase,
    getFinanceStatsUseCase,
    buildAdminWalletRouter: (auth) =>
      buildAdminWalletRouter({
        authenticate: auth.authenticate,
        requireFinanceRole: auth.requireRole('SUPER_ADMIN', 'FINANCE_ADMIN'),
        adjustWallet: makeAdminAdjustWalletController(adminAdjustWalletUseCase),
        getWallet: makeAdminGetWalletController(getWalletUseCase),
        listWallets: makeAdminListWalletsController(listWalletsUseCase),
        getStats: makeAdminGetFinanceStatsController(getFinanceStatsUseCase),
        listTransactions: makeAdminListTransactionsController(listTransactionsUseCase),
      }),
    buildDriverWalletRouter: (auth) =>
      buildDriverWalletRouter({
        authenticate: auth.authenticate,
        requireDriver: auth.requireRole('DRIVER'),
        getMyWallet: makeMyWalletController(getWalletUseCase, deps.resolveDriverId),
      }),
  };
}
