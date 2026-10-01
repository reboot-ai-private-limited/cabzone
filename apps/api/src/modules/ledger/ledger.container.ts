import type { RequestHandler, Router } from 'express';
import type { AuthRole } from '@cabzone/contracts';
import { AdminAdjustWalletUseCase } from './application/useCases/adminAdjustWallet.usecase.js';
import { GetWalletUseCase } from './application/useCases/getWallet.usecase.js';
import type { WalletRepositoryPort } from './domain/index.js';
import {
  makeAdminAdjustWalletController,
  makeAdminGetWalletController,
  makeMyWalletController,
} from './interface/ledger.controller.js';
import { buildAdminWalletRouter, buildDriverWalletRouter } from './interface/ledger.routes.js';

export interface LedgerContainerDeps {
  walletRepo: WalletRepositoryPort;
  resolveDriverId: (userId: string) => Promise<string | null>;
}

export interface LedgerAuth {
  authenticate: RequestHandler;
  requireRole: (...roles: AuthRole[]) => RequestHandler;
}

export interface LedgerContainer {
  walletRepo: WalletRepositoryPort;
  adminAdjustWalletUseCase: AdminAdjustWalletUseCase;
  getWalletUseCase: GetWalletUseCase;
  buildAdminWalletRouter: (auth: LedgerAuth) => Router;
  buildDriverWalletRouter: (auth: LedgerAuth) => Router;
}

export function buildLedgerContainer(deps: LedgerContainerDeps): LedgerContainer {
  const adminAdjustWalletUseCase = new AdminAdjustWalletUseCase(deps.walletRepo);
  const getWalletUseCase = new GetWalletUseCase(deps.walletRepo);

  return {
    walletRepo: deps.walletRepo,
    adminAdjustWalletUseCase,
    getWalletUseCase,
    buildAdminWalletRouter: (auth) =>
      buildAdminWalletRouter({
        authenticate: auth.authenticate,
        requireFinanceRole: auth.requireRole('SUPER_ADMIN', 'FINANCE_ADMIN'),
        adjustWallet: makeAdminAdjustWalletController(adminAdjustWalletUseCase),
        getWallet: makeAdminGetWalletController(getWalletUseCase),
      }),
    buildDriverWalletRouter: (auth) =>
      buildDriverWalletRouter({
        authenticate: auth.authenticate,
        requireDriver: auth.requireRole('DRIVER'),
        getMyWallet: makeMyWalletController(getWalletUseCase, deps.resolveDriverId),
      }),
  };
}
