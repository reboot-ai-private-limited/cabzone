import type { RequestHandler, Router } from 'express';
import type { AuthRole } from '@cabzone/contracts';
import type { UnitOfWorkPort } from '../../shared/db/unitOfWork.port.js';
import { AdminAdjustWalletUseCase } from './application/useCases/adminAdjustWallet.usecase.js';
import { GetFinanceStatsUseCase } from './application/useCases/getFinanceStats.usecase.js';
import { GetWalletUseCase } from './application/useCases/getWallet.usecase.js';
import { ListTransactionsUseCase } from './application/useCases/listTransactions.usecase.js';
import { ListWalletsUseCase } from './application/useCases/listWallets.usecase.js';
import { ReconcileWalletLedgerUseCase } from './application/useCases/reconcileWalletLedger.usecase.js';
import type { UserLookupItem, WalletRepositoryPort } from './domain/index.js';
import {
  makeAdminAdjustWalletController,
  makeAdminGetFinanceStatsController,
  makeAdminGetWalletController,
  makeAdminListTransactionsController,
  makeAdminListWalletsController,
  makeAdminReconcileWalletLedgerController,
  makeMyWalletController,
  makeMyWalletTransactionsController,
} from './interface/ledger.controller.js';
import { buildAdminWalletRouter, buildDriverWalletRouter } from './interface/ledger.routes.js';
import { env, isProdLike } from '../../config/env.js';
import { WalletMoneyUseCase } from './application/useCases/walletMoney.usecase.js';
import { WalletRechargeTickets } from './infrastructure/walletRechargeTickets.js';
import { MongoWalletOperationRepository } from './infrastructure/persistence/walletOperation.repository.js';
import type {
  WalletOperationRepository,
  WalletPaymentGateway,
} from './domain/walletOperation.port.js';
import { walletMoneyControllers } from './interface/walletMoney.controller.js';
import { registerWalletMoneySwaggerPaths } from './interface/walletMoney.swagger.js';

export interface LedgerLookups {
  getDrivers?: () => Promise<UserLookupItem[]>;
  getRiders?: () => Promise<UserLookupItem[]>;
}

export interface LedgerContainerDeps {
  walletOperations?: WalletOperationRepository;
  walletPaymentGateway?: WalletPaymentGateway;
  unitOfWork: UnitOfWorkPort;
  walletRepo: WalletRepositoryPort;
  resolveDriverId: (userId: string) => Promise<string | null>;
  lookups?: LedgerLookups;
}

export interface LedgerAuth {
  authenticate: RequestHandler;
  requireRole: (...roles: AuthRole[]) => RequestHandler;
}

export interface LedgerContainer {
  walletMoneyUseCase: WalletMoneyUseCase;
  walletRepo: WalletRepositoryPort;
  adminAdjustWalletUseCase: AdminAdjustWalletUseCase;
  getWalletUseCase: GetWalletUseCase;
  listWalletsUseCase: ListWalletsUseCase;
  listTransactionsUseCase: ListTransactionsUseCase;
  getFinanceStatsUseCase: GetFinanceStatsUseCase;
  reconcileWalletLedgerUseCase: ReconcileWalletLedgerUseCase;
  buildAdminWalletRouter: (auth: LedgerAuth) => Router;
  buildDriverWalletRouter: (auth: LedgerAuth) => Router;
}

export function buildLedgerContainer(deps: LedgerContainerDeps): LedgerContainer {
  registerWalletMoneySwaggerPaths();
  const operations = deps.walletOperations ?? new MongoWalletOperationRepository();
  const walletMoneyEnabled = !isProdLike && env.RAZORPAY_MODE === 'test';
  const walletMoneyUseCase = new WalletMoneyUseCase({
    walletRepo: deps.walletRepo,
    operations,
    gateway: deps.walletPaymentGateway,
    unitOfWork: deps.unitOfWork,
    enabled: walletMoneyEnabled,
  });
  const money = walletMoneyControllers(
    walletMoneyUseCase,
    new WalletRechargeTickets(env.JWT_ACCESS_SECRET),
    deps.resolveDriverId,
  );
  const adminAdjustWalletUseCase = new AdminAdjustWalletUseCase(deps.walletRepo, deps.unitOfWork);
  const getWalletUseCase = new GetWalletUseCase(deps.walletRepo);
  const listWalletsUseCase = new ListWalletsUseCase(deps.walletRepo, deps.lookups);
  const listTransactionsUseCase = new ListTransactionsUseCase(deps.walletRepo);
  const getFinanceStatsUseCase = new GetFinanceStatsUseCase(deps.walletRepo);
  const activeGateway =
    walletMoneyEnabled && deps.walletPaymentGateway?.keyId ? deps.walletPaymentGateway : undefined;
  const reconcileWalletLedgerUseCase = new ReconcileWalletLedgerUseCase({
    walletRepo: deps.walletRepo,
    operations,
    gateway: activeGateway,
    walletMoneyUseCase,
  });

  return {
    walletMoneyUseCase,
    walletRepo: deps.walletRepo,
    adminAdjustWalletUseCase,
    getWalletUseCase,
    listWalletsUseCase,
    listTransactionsUseCase,
    getFinanceStatsUseCase,
    reconcileWalletLedgerUseCase,
    buildAdminWalletRouter: (auth) =>
      buildAdminWalletRouter({
        money,
        authenticate: auth.authenticate,
        requireFinanceRole: auth.requireRole('SUPER_ADMIN', 'FINANCE_ADMIN'),
        adjustWallet: makeAdminAdjustWalletController(adminAdjustWalletUseCase),
        getWallet: makeAdminGetWalletController(getWalletUseCase),
        listWallets: makeAdminListWalletsController(listWalletsUseCase),
        getStats: makeAdminGetFinanceStatsController(getFinanceStatsUseCase),
        listTransactions: makeAdminListTransactionsController(listTransactionsUseCase),
        reconcileLedger: makeAdminReconcileWalletLedgerController(reconcileWalletLedgerUseCase),
      }),
    buildDriverWalletRouter: (auth) =>
      buildDriverWalletRouter({
        money,
        authenticate: auth.authenticate,
        requireDriver: auth.requireRole('DRIVER'),
        getMyWallet: makeMyWalletController(getWalletUseCase, deps.resolveDriverId),
        listMyTransactions: makeMyWalletTransactionsController(
          deps.walletRepo,
          listTransactionsUseCase,
          deps.resolveDriverId,
        ),
      }),
  };
}
