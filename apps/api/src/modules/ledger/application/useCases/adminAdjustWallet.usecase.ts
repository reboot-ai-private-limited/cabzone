import type { WalletOwnerType, WalletTransactionType } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import {
  calculateNewBalance,
  type WalletEntity,
  type WalletRepositoryPort,
  type WalletTransactionEntity,
} from '../../domain/index.js';

export interface AdminAdjustWalletInput {
  driverId?: string | undefined;
  riderId?: string | undefined;
  walletId?: string | undefined;
  ownerType?: WalletOwnerType | undefined;
  amountPaise: number;
  type: Extract<WalletTransactionType, 'CREDIT' | 'DEBIT'>;
  reason: string;
  adminId: string;
  idempotencyKey?: string | undefined;
}

export interface AdminAdjustWalletResult {
  wallet: WalletEntity;
  transaction: WalletTransactionEntity;
}

/** Manual credit/debit by finance staff. Creates the driver or rider wallet on first use. */
export class AdminAdjustWalletUseCase {
  constructor(
    private readonly walletRepo: WalletRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
  ) {}

  async execute(input: AdminAdjustWalletInput): Promise<AdminAdjustWalletResult> {
    if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0) throw AppError.badRequest('Amount must be a positive safe integer.');
    try {
      return await this.unitOfWork.run(() => this.adjust(input));
    } catch (error) {
      if (input.idempotencyKey && error && typeof error === 'object' && 'code' in error && error.code === 11000) {
        const replay = await this.replay(input);
        if (replay) return replay;
      }
      throw error;
    }
  }

  private async replay(input: AdminAdjustWalletInput): Promise<AdminAdjustWalletResult | null> {
    if (!input.idempotencyKey) return null;
    const transaction = await this.walletRepo.findTransactionByIdempotencyKey(input.idempotencyKey);
    if (!transaction) return null;
    if (transaction.referenceType !== 'ADMIN_ADJUSTMENT' || transaction.amountPaise !== input.amountPaise ||
      transaction.type !== input.type || transaction.note !== input.reason || transaction.createdBy !== input.adminId ||
      (input.walletId && transaction.walletId !== input.walletId) ||
      (input.driverId && transaction.driverId !== input.driverId) ||
      (input.riderId && transaction.riderId !== input.riderId)) {
      throw AppError.conflict('IDEMPOTENCY_KEY_REUSED: Key belongs to a different adjustment.');
    }
    const wallet = await this.walletRepo.findById(transaction.walletId);
    if (!wallet) throw AppError.conflict('WALLET_NOT_FOUND: Adjustment wallet is unavailable.');
    return { wallet, transaction };
  }

  private async adjust(input: AdminAdjustWalletInput): Promise<AdminAdjustWalletResult> {
    const replay = await this.replay(input);
    if (replay) return replay;
    const now = new Date();
    let wallet: WalletEntity | null = null;

    if (input.walletId) {
      wallet = (await this.walletRepo.findById(input.walletId)) ?? null;
    }

    if (!wallet && input.riderId) {
      wallet = (await this.walletRepo.findByRiderId(input.riderId)) ?? null;
      if (!wallet) {
        wallet = {
          id: newUuid(),
          ownerType: 'RIDER',
          driverId: '',
          riderId: input.riderId,
          balancePaise: 0,
          owedPaise: 0,
          status: 'ACTIVE',
          version: 0,
          createdAt: now,
          updatedAt: now,
        };
      }
    }

    if (!wallet && input.driverId) {
      wallet = (await this.walletRepo.findByDriverId(input.driverId)) ?? null;
      if (!wallet) {
        wallet = {
          id: newUuid(),
          ownerType: 'DRIVER',
          driverId: input.driverId,
          riderId: null,
          balancePaise: 0,
          owedPaise: 0,
          status: 'ACTIVE',
          version: 0,
          createdAt: now,
          updatedAt: now,
        };
      }
    }

    if (!wallet) {
      throw AppError.badRequest('Must provide a valid driverId, riderId, or walletId.');
    }

    if (wallet.status !== 'ACTIVE') {
      throw AppError.conflict(`WALLET_NOT_ACTIVE: Wallet is ${wallet.status}.`);
    }

    if (input.type === 'DEBIT' && wallet.balancePaise < input.amountPaise) {
      throw AppError.badRequest('INSUFFICIENT_BALANCE: Debit would take the wallet below zero.');
    }

    const balanceAfter = calculateNewBalance(wallet.balancePaise, input.amountPaise, input.type);
    const transaction = await this.walletRepo.recordTransaction({
      id: newUuid(),
      walletId: wallet.id,
      ownerType: wallet.ownerType,
      driverId: wallet.driverId || null,
      riderId: wallet.riderId || null,
      type: input.type,
      amountPaise: input.amountPaise,
      referenceType: 'ADMIN_ADJUSTMENT',
      referenceId: null,
      idempotencyKey: input.idempotencyKey ?? `admin_adj_${newUuid()}`,
      balanceBeforePaise: wallet.balancePaise,
      balanceAfterPaise: balanceAfter,
      createdBy: input.adminId,
      note: input.reason,
      createdAt: now,
    });

    const saved = await this.walletRepo.save({
      ...wallet,
      balancePaise: balanceAfter,
      version: wallet.version + 1,
      updatedAt: now,
    });

    return { wallet: saved, transaction };
  }
}
