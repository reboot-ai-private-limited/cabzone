import type { DriverWalletActivityDto, WalletOperationDto } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import type { WalletEntity } from '../../domain/wallet.entity.js';
import type { WalletRepositoryPort } from '../../domain/wallet.port.js';
import type {
  WalletOperation,
  WalletOperationRepository,
  WalletPaymentGateway,
} from '../../domain/walletOperation.port.js';

export function walletOperationView(operation: WalletOperation): WalletOperationDto {
  return {
    id: operation.id,
    driverId: operation.driverId,
    kind: operation.kind,
    status: operation.status,
    amountPaise: operation.amountPaise,
    rechargePaise: operation.rechargePaise,
    earningsPaise: operation.earningsPaise,
    destinationUpi: operation.destinationUpi,
    transferReference: operation.transferReference,
    reason: operation.reason,
    testMode: true,
    createdAt: operation.createdAt.toISOString(),
    updatedAt: operation.updatedAt.toISOString(),
  };
}

export class WalletMoneyUseCase {
  constructor(
    private readonly deps: {
      walletRepo: WalletRepositoryPort;
      operations: WalletOperationRepository;
      gateway?: WalletPaymentGateway | undefined;
      unitOfWork: UnitOfWorkPort;
      enabled: boolean;
    },
  ) {}

  private sandbox() {
    if (!this.deps.enabled || this.deps.gateway?.live)
      throw AppError.badRequest('Wallet recharge and cashout are available only in test mode.');
  }
  private gateway() {
    this.sandbox();
    if (!this.deps.gateway) throw AppError.badRequest('Wallet payment service is not configured.');
    return this.deps.gateway;
  }
  private amount(amount: number, minimum: number) {
    if (!Number.isSafeInteger(amount) || amount < minimum || amount > 10000000)
      throw AppError.badRequest(`Amount must be between ₹${minimum / 100} and ₹1,00,000.`);
  }
  private key(driverId: string, kind: WalletOperation['kind'], key: string) {
    if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(key))
      throw AppError.badRequest('A valid request key is required.');
    return `${driverId}:${kind}:${key}`;
  }
  private async owned(id: string, driverId: string): Promise<WalletOperation> {
    const operation = await this.deps.operations.find(id);
    if (!operation || operation.driverId !== driverId)
      throw AppError.notFound('Wallet request not found.');
    return operation;
  }
  private checkReplay(operation: WalletOperation, amountPaise: number, destination: string | null) {
    if (operation.amountPaise !== amountPaise || operation.destinationUpi !== destination)
      throw AppError.conflict('Request key belongs to different payment details.');
  }
  private async wallet(driverId: string): Promise<WalletEntity> {
    const existing = await this.deps.walletRepo.findByDriverId(driverId);
    if (existing) return existing;
    const now = new Date();
    return this.deps.walletRepo.save({
      // Use the driver ID so concurrent first funding writes target the same wallet document.
      id: driverId,
      ownerType: 'DRIVER',
      driverId,
      balancePaise: 0,
      earningsBalancePaise: 0,
      status: 'ACTIVE',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }
  private blocked(wallet: WalletEntity | null) {
    if (!wallet) return 'There are no funds available to cash out.';
    if (wallet.status !== 'ACTIVE') return 'Cashout is unavailable while your wallet is blocked.';
    if (wallet.balancePaise < 0 || (wallet.owedPaise ?? 0) > 0)
      return 'Clear your commission dues before cashout.';
    return null;
  }
  async activity(driverId: string): Promise<DriverWalletActivityDto> {
    const [wallet, operations, cashouts] = await Promise.all([
      this.deps.walletRepo.findByDriverId(driverId),
      this.deps.operations.list(driverId),
      this.deps.operations.list(driverId, 'CASHOUT', 'PENDING'),
    ]);
    const cashoutBlockedReason = !this.deps.enabled
      ? 'Wallet money movement is available only in test mode.'
      : this.blocked(wallet);
    return {
      commissionBalancePaise: wallet?.balancePaise ?? 0,
      earningsBalancePaise: wallet?.earningsBalancePaise ?? 0,
      availableCashoutPaise: cashoutBlockedReason
        ? 0
        : (wallet?.balancePaise ?? 0) + (wallet?.earningsBalancePaise ?? 0),
      pendingCashoutPaise: cashouts
        .filter((entry) => entry.status === 'PENDING')
        .reduce((sum, entry) => sum + entry.amountPaise, 0),
      cashoutBlockedReason,
      operations: operations.map(walletOperationView),
      testMode: true,
    };
  }
  private operation(
    driverId: string,
    kind: WalletOperation['kind'],
    amountPaise: number,
    key: string,
  ): WalletOperation {
    const now = new Date();
    return {
      id: newUuid(),
      driverId,
      kind,
      amountPaise,
      rechargePaise: 0,
      earningsPaise: 0,
      idempotencyKey: key,
      status: kind === 'RECHARGE' ? 'CREATED' : 'PENDING',
      destinationUpi: null,
      orderId: null,
      providerPaymentId: null,
      transferReference: null,
      reason: null,
      resolvedBy: null,
      testMode: true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
  }
  async createRecharge(
    driverId: string,
    amountPaise: number,
    requestKey: string,
  ): Promise<WalletOperation> {
    this.gateway();
    this.amount(amountPaise, 10000);
    const key = this.key(driverId, 'RECHARGE', requestKey);
    let operation: WalletOperation;
    try {
      operation = await this.deps.unitOfWork.run(async () => {
        const existing = await this.deps.operations.findByKey(key);
        if (existing) {
          this.checkReplay(existing, amountPaise, null);
          return existing;
        }
        return this.deps.operations.save(this.operation(driverId, 'RECHARGE', amountPaise, key));
      });
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000))
        throw error;
      const existing = await this.deps.operations.findByKey(key);
      if (!existing) throw error;
      this.checkReplay(existing, amountPaise, null);
      operation = existing;
    }
    return this.ensureOrder(operation);
  }
  private async ensureOrder(operation: WalletOperation): Promise<WalletOperation> {
    if (operation.orderId) return operation;
    const orderId = await this.gateway().createOrder(
      operation.amountPaise,
      operation.id,
      'wallet_recharge_test',
    );
    operation = await this.deps.unitOfWork.run(async () => {
      const current = await this.owned(operation.id, operation.driverId);
      if (current.orderId) return current;
      return this.deps.operations.save({
        ...current,
        orderId,
        version: current.version + 1,
        updatedAt: new Date(),
      });
    });
    return operation;
  }
  async checkout(id: string, driverId: string) {
    const operation = await this.owned(id, driverId);
    if (operation.kind !== 'RECHARGE' || !operation.orderId || operation.status !== 'CREATED')
      throw AppError.conflict('This recharge is no longer awaiting payment.');
    return {
      keyId: this.gateway().keyId,
      orderId: operation.orderId,
      amountPaise: operation.amountPaise,
      currency: 'INR' as const,
      testMode: true as const,
    };
  }
  async reconcileRecharge(id: string, driverId: string) {
    const gateway = this.gateway();
    let operation = await this.owned(id, driverId);
    if (operation.kind !== 'RECHARGE') throw AppError.badRequest('This is not a recharge.');
    if (operation.status === 'COMPLETED') return operation;
    if (!operation.orderId) operation = await this.ensureOrder(operation);
    if (!operation.orderId) throw AppError.conflict('Recharge order is not ready. Retry shortly.');
    const paymentId = await gateway.findCapturedPayment(operation.orderId, operation.amountPaise);
    if (!paymentId) return operation;
    return this.deps.unitOfWork.run(async () => {
      const current = await this.owned(id, driverId);
      if (current.status === 'COMPLETED') return current;
      const wallet = await this.wallet(driverId);
      if (wallet.status !== 'ACTIVE')
        throw AppError.conflict('Wallet is blocked. Contact support to reconcile this recharge.');
      const balancePaise = wallet.balancePaise + current.amountPaise;
      await this.deps.walletRepo.save({
        ...wallet,
        balancePaise,
        version: wallet.version + 1,
        updatedAt: new Date(),
      });
      await this.deps.walletRepo.recordTransaction({
        id: newUuid(),
        walletId: wallet.id,
        driverId,
        type: 'CREDIT',
        bucket: 'COMMISSION',
        amountPaise: current.amountPaise,
        referenceType: 'WALLET_RECHARGE',
        referenceId: current.id,
        idempotencyKey: `recharge:${current.id}`,
        balanceBeforePaise: wallet.balancePaise,
        balanceAfterPaise: balancePaise,
        createdBy: driverId,
        note: 'Verified test UPI recharge',
        createdAt: new Date(),
      });
      return this.deps.operations.save({
        ...current,
        status: 'COMPLETED',
        providerPaymentId: paymentId,
        version: current.version + 1,
        updatedAt: new Date(),
      });
    });
  }
  async requestCashout(
    driverId: string,
    amountPaise: number,
    destination: string,
    requestKey: string,
  ) {
    this.sandbox();
    this.amount(amountPaise, 100);
    const destinationUpi = destination.trim().toLowerCase();
    if (!/^[a-z0-9._-]{2,256}@[a-z0-9][a-z0-9.-]{1,63}$/.test(destinationUpi))
      throw AppError.badRequest('Enter a valid UPI ID.');
    const key = this.key(driverId, 'CASHOUT', requestKey);
    return this.deps.unitOfWork.run(async () => {
      const existing = await this.deps.operations.findByKey(key);
      if (existing) {
        this.checkReplay(existing, amountPaise, destinationUpi);
        return existing;
      }
      const wallet = await this.wallet(driverId);
      const blocked = this.blocked(wallet);
      if (blocked) throw AppError.conflict(blocked);
      if ((await this.deps.operations.list(driverId, 'CASHOUT', 'PENDING')).length)
        throw AppError.conflict('Your previous cashout is still pending.');
      const earningsPaise = Math.min(amountPaise, wallet.earningsBalancePaise ?? 0);
      const rechargePaise = amountPaise - earningsPaise;
      if (rechargePaise > wallet.balancePaise)
        throw AppError.badRequest('Cashout exceeds your available balance.');
      const operation = {
        ...this.operation(driverId, 'CASHOUT', amountPaise, key),
        earningsPaise,
        rechargePaise,
        destinationUpi,
      };
      await this.moveCashout(wallet, operation, false);
      return this.deps.operations.save(operation);
    });
  }
  private async moveCashout(wallet: WalletEntity, operation: WalletOperation, restore: boolean) {
    const direction = restore ? 1 : -1;
    const balancePaise = wallet.balancePaise + direction * operation.rechargePaise;
    const earningsBalancePaise =
      (wallet.earningsBalancePaise ?? 0) + direction * operation.earningsPaise;
    await this.deps.walletRepo.save({
      ...wallet,
      balancePaise,
      earningsBalancePaise,
      version: wallet.version + 1,
      updatedAt: new Date(),
    });
    for (const bucket of ['COMMISSION', 'EARNINGS'] as const) {
      const amountPaise =
        bucket === 'COMMISSION' ? operation.rechargePaise : operation.earningsPaise;
      if (!amountPaise) continue;
      const before =
        bucket === 'COMMISSION' ? wallet.balancePaise : (wallet.earningsBalancePaise ?? 0);
      await this.deps.walletRepo.recordTransaction({
        id: newUuid(),
        walletId: wallet.id,
        driverId: wallet.driverId,
        bucket,
        type: restore ? 'REVERSAL' : 'DEBIT',
        amountPaise,
        referenceType: restore ? 'CASHOUT_REVERSAL' : 'WALLET_CASHOUT',
        referenceId: operation.id,
        idempotencyKey: `${restore ? 'cashout-return' : 'cashout-hold'}:${operation.id}:${bucket}`,
        balanceBeforePaise: before,
        balanceAfterPaise: before + direction * amountPaise,
        createdBy: operation.driverId,
        note: restore
          ? 'Cashout rejected; funds returned'
          : 'Test cashout reserved for Finance review',
        createdAt: new Date(),
      });
    }
  }
  async resolveCashout(
    id: string,
    outcome: 'PAID' | 'REJECTED',
    referenceOrReason: string,
    adminId: string,
  ) {
    this.sandbox();
    const detail = referenceOrReason.trim();
    if (detail.length < 5 || detail.length > 255)
      throw AppError.badRequest(
        'Provide a transfer reference or rejection reason (5–255 characters).',
      );
    return this.deps.unitOfWork.run(async () => {
      const current = await this.deps.operations.find(id);
      if (!current || current.kind !== 'CASHOUT')
        throw AppError.notFound('Cashout request not found.');
      const status = outcome === 'PAID' ? 'COMPLETED' : 'REJECTED';
      if (current.status !== 'PENDING') {
        if (
          current.status === status &&
          (outcome === 'PAID' ? current.transferReference : current.reason) === detail
        )
          return current;
        throw AppError.conflict('Cashout already has a different final decision.');
      }
      if (outcome === 'REJECTED')
        await this.moveCashout(await this.wallet(current.driverId), current, true);
      return this.deps.operations.save({
        ...current,
        status,
        transferReference: outcome === 'PAID' ? detail : null,
        reason: outcome === 'REJECTED' ? detail : null,
        resolvedBy: adminId,
        version: current.version + 1,
        updatedAt: new Date(),
      });
    });
  }
  async cashouts() {
    return (await this.deps.operations.list(undefined, 'CASHOUT', 'PENDING')).map(
      walletOperationView,
    );
  }
}
