import type { Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import type { AdminAdjustWalletUseCase } from '../application/useCases/adminAdjustWallet.usecase.js';
import type { GetFinanceStatsUseCase } from '../application/useCases/getFinanceStats.usecase.js';
import type { GetWalletUseCase } from '../application/useCases/getWallet.usecase.js';
import type { ListTransactionsUseCase } from '../application/useCases/listTransactions.usecase.js';
import type { ListWalletsUseCase } from '../application/useCases/listWallets.usecase.js';
import type { ReconcileWalletLedgerUseCase } from '../application/useCases/reconcileWalletLedger.usecase.js';
import { reportWalletReconciliationDiscrepancies } from '../../../shared/monitoring/alerting.js';
import type { WalletRepositoryPort } from '../domain/index.js';
import {
  adminAdjustWalletSchema,
  driverListTransactionsQuerySchema,
  driverMyWalletQuerySchema,
  listTransactionsQuerySchema,
  listWalletsQuerySchema,
  reconcileWalletLedgerSchema,
} from './ledger.validation.js';

const driverIdParamSchema = z.object({ driverId: z.string() });

export function makeAdminAdjustWalletController(useCase: AdminAdjustWalletUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated('Authentication required.');
    const body = adminAdjustWalletSchema.parse(req.body);
    const result = await useCase.execute({ ...body, adminId: req.auth.userId });
    sendSuccess(req, res, result, 'Wallet adjusted successfully', 201);
  });
}

export function makeAdminGetWalletController(useCase: GetWalletUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { driverId } = driverIdParamSchema.parse(req.params);
    sendSuccess(req, res, await useCase.execute(driverId), 'Wallet retrieved successfully');
  });
}

export function makeAdminListWalletsController(useCase: ListWalletsUseCase): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = listWalletsQuerySchema.parse(req.query);
    const result = await useCase.execute(query);
    sendSuccess(req, res, result, 'Wallets retrieved successfully');
  });
}

export function makeAdminGetFinanceStatsController(
  useCase: GetFinanceStatsUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const stats = await useCase.execute();
    sendSuccess(req, res, stats, 'Finance statistics retrieved successfully');
  });
}

export function makeAdminListTransactionsController(
  useCase: ListTransactionsUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = listTransactionsQuerySchema.parse(req.query);
    const result = await useCase.execute(query);
    sendSuccess(req, res, result, 'Transactions retrieved successfully');
  });
}

export function makeMyWalletController(
  useCase: GetWalletUseCase,
  resolveDriverId: (userId: string) => Promise<string | null>,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated('Authentication required.');
    const { txLimit } = driverMyWalletQuerySchema.parse(req.query);
    const driverId = await resolveDriverId(req.auth.userId);
    if (!driverId) {
      throw AppError.forbidden('DRIVER_PROFILE_REQUIRED: No driver profile for this account.');
    }
    sendSuccess(
      req,
      res,
      await useCase.execute(driverId, txLimit),
      'Wallet retrieved successfully',
    );
  });
}

export function makeMyWalletTransactionsController(
  walletRepo: WalletRepositoryPort,
  useCase: ListTransactionsUseCase,
  resolveDriverId: (userId: string) => Promise<string | null>,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AppError.unauthenticated('Authentication required.');
    const query = driverListTransactionsQuerySchema.parse(req.query);
    const driverId = await resolveDriverId(req.auth.userId);
    if (!driverId) {
      throw AppError.forbidden('DRIVER_PROFILE_REQUIRED: No driver profile for this account.');
    }
    const wallet = await walletRepo.findByDriverId(driverId);
    if (!wallet) {
      sendSuccess(
        req,
        res,
        { items: [], total: 0, limit: query.limit, offset: query.offset, hasMore: false },
        'Wallet transactions retrieved successfully',
      );
      return;
    }
    const types = query.type
      ? [query.type]
      : query.direction === 'CREDIT'
        ? (['CREDIT', 'REVERSAL'] as const)
        : query.direction === 'DEBIT'
          ? (['DEBIT', 'ADJUSTMENT'] as const)
          : undefined;
    const { items, total } = await useCase.execute({
      walletId: wallet.id,
      types,
      referenceType: query.referenceType,
      limit: query.limit,
      offset: query.offset,
    });
    sendSuccess(
      req,
      res,
      {
        items,
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + items.length < total,
      },
      'Wallet transactions retrieved successfully',
    );
  });
}

export function makeAdminReconcileWalletLedgerController(
  useCase: ReconcileWalletLedgerUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const body = reconcileWalletLedgerSchema.parse(req.body ?? {});
    const report = await useCase.execute(body);
    await reportWalletReconciliationDiscrepancies({
      checkedWallets: report.checkedWallets,
      issueCount: report.issues.length,
      issueCodes: report.issues.map((issue) => issue.code),
    });
    sendSuccess(req, res, report, 'Wallet ledger reconciliation completed');
  });
}
