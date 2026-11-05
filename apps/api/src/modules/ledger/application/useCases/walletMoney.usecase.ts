import type { DriverWalletActivityDto, WalletOperationDto } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import type { WalletEntity } from '../../domain/wallet.entity.js';
import type { WalletRepositoryPort } from '../../domain/wallet.port.js';
import {
  type CashoutDestination,
  PayoutRejectedError,
  type ProviderPayout,
  type WalletOperation,
  type WalletOperationRepository,
  type WalletPaymentGateway,
  type WalletPayoutGateway,
} from '../../domain/walletOperation.port.js';

/**
 * Masks phone-number-based UPI addresses (local part before `@` with >= 7 digits)
 * on other-account admin outputs while preserving non-phone VPA handles.
 */
export function maskPhoneBasedUpi(vpa: string | null): string | null {
  if (!vpa) return null;
  const atIndex = vpa.indexOf('@');
  const local = atIndex >= 0 ? vpa.slice(0, atIndex) : vpa;
  const domain = atIndex >= 0 ? vpa.slice(atIndex) : '';
  const digits = local.replace(/\D/g, '');
  if (digits.length < 7) return vpa;
  let seen = 0;
  const keepFrom = digits.length - 4;
  const maskedLocal = local.replace(/\d/g, (digit) => (seen++ < keepFrom ? '*' : digit));
  return `${maskedLocal}${domain}`;
}

function maskedDestination(operation: WalletOperation): string | null {
  const bank = operation.destinationBank;
  if (operation.destinationType === 'BANK' && bank)
    return `Bank ****${bank.accountNumber.slice(-4)} (${bank.ifsc})`;
  return operation.destinationUpi;
}

function fullDestination(operation: WalletOperation): string | null {
  const bank = operation.destinationBank;
  if (operation.destinationType === 'BANK' && bank)
    return `${bank.accountHolderName} · A/C ${bank.accountNumber} · ${bank.ifsc}`;
  return operation.destinationUpi;
}

/** Stable identity of a payout destination, used to detect an idempotency key reused with new details. */
function destinationKey(operation: WalletOperation): string | null {
  const bank = operation.destinationBank;
  if (operation.destinationType === 'BANK' && bank) return `BANK:${bank.accountNumber}:${bank.ifsc}`;
  return operation.destinationUpi;
}

/** Keep in sync with the driver app's wallet panel. */
export const MIN_RECHARGE_PAISE = 50_000; // ₹500
export const MIN_CASHOUT_PAISE = 20_000; // ₹200
export const MAX_WALLET_MONEY_PAISE = 10_000_000; // ₹1,00,000

const UPI_PATTERN = /^[a-z0-9._-]{2,256}@[a-z0-9][a-z0-9.-]{1,63}$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Validates and normalises a cashout destination; a bare string is treated as a UPI ID. */
export function parseCashoutDestination(input: string | CashoutDestination): CashoutDestination {
  const destination: CashoutDestination =
    typeof input === 'string' ? { type: 'UPI', upiId: input } : input;
  if (destination.type === 'UPI') {
    const upiId = destination.upiId.trim().toLowerCase();
    if (!UPI_PATTERN.test(upiId)) throw AppError.badRequest('Enter a valid UPI ID.');
    return { type: 'UPI', upiId };
  }
  const accountNumber = destination.accountNumber.replace(/\s/g, '');
  const ifsc = destination.ifsc.trim().toUpperCase();
  const accountHolderName = destination.accountHolderName.trim().replace(/\s+/g, ' ');
  if (!/^\d{9,18}$/.test(accountNumber))
    throw AppError.badRequest('Enter a valid bank account number (9–18 digits).');
  if (!IFSC_PATTERN.test(ifsc)) throw AppError.badRequest('Enter a valid IFSC code.');
  if (accountHolderName.length < 2 || accountHolderName.length > 100)
    throw AppError.badRequest('Enter the account holder name as it appears at the bank.');
  return { type: 'BANK', accountNumber, ifsc, accountHolderName };
}

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
    destinationType: operation.destinationType ?? 'UPI',
    destinationLabel: maskedDestination(operation),
    transferReference: operation.transferReference,
    reason: operation.reason,
    testMode: operation.testMode,
    createdAt: operation.createdAt.toISOString(),
    updatedAt: operation.updatedAt.toISOString(),
  };
}

export function adminWalletOperationView(operation: WalletOperation): WalletOperationDto {
  return {
    id: operation.id,
    driverId: operation.driverId,
    kind: operation.kind,
    status: operation.status,
    amountPaise: operation.amountPaise,
    rechargePaise: operation.rechargePaise,
    earningsPaise: operation.earningsPaise,
    destinationUpi: operation.destinationUpi,
    destinationType: operation.destinationType ?? 'UPI',
    // Finance needs the full details to settle a payout manually.
    destinationLabel: fullDestination(operation),
    transferReference: operation.transferReference,
    reason: operation.reason,
    testMode: operation.testMode,
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
      /** When set, cashouts are paid out automatically; otherwise Finance settles them manually. */
      payouts?: WalletPayoutGateway | undefined;
      /** Name/phone used to register the driver as a payout contact. */
      driverContact?: ((driverId: string) => Promise<{ name: string; phone: string | null } | null>) | undefined;
      unitOfWork: UnitOfWorkPort;
      enabled: boolean;
    },
  ) {}

  private ensureEnabled() {
    if (!this.deps.enabled)
      throw AppError.badRequest('Wallet recharge and cashout are not enabled on this server.');
  }
  private get testMode() {
    return !this.deps.gateway?.live;
  }
  private gateway() {
    this.ensureEnabled();
    if (!this.deps.gateway) throw AppError.badRequest('Wallet payment service is not configured.');
    return this.deps.gateway;
  }
  private amount(amount: number, minimum: number) {
    if (!Number.isSafeInteger(amount) || amount < minimum || amount > MAX_WALLET_MONEY_PAISE)
      throw AppError.badRequest(`Amount must be between ₹${minimum / 100} and ₹${(MAX_WALLET_MONEY_PAISE / 100).toLocaleString('en-IN')}.`);
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
    if (operation.amountPaise !== amountPaise || destinationKey(operation) !== destination)
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
      this.deps.operations.list(driverId, 'CASHOUT'),
    ]);
    const cashoutBlockedReason = !this.deps.enabled
      ? 'Wallet money movement is not enabled right now.'
      : this.blocked(wallet);
    return {
      commissionBalancePaise: wallet?.balancePaise ?? 0,
      earningsBalancePaise: wallet?.earningsBalancePaise ?? 0,
      availableCashoutPaise: cashoutBlockedReason
        ? 0
        : (wallet?.balancePaise ?? 0) + (wallet?.earningsBalancePaise ?? 0),
      pendingCashoutPaise: cashouts
        .filter((entry) => entry.status === 'PENDING' || entry.status === 'PROCESSING')
        .reduce((sum, entry) => sum + entry.amountPaise, 0),
      cashoutBlockedReason,
      operations: operations.map(walletOperationView),
      testMode: this.testMode,
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
      destinationType: 'UPI',
      destinationLabel: null,
      destinationBank: null,
      orderId: null,
      providerPaymentId: null,
      transferReference: null,
      reason: null,
      resolvedBy: null,
      testMode: this.testMode,
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
    this.amount(amountPaise, MIN_RECHARGE_PAISE);
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
      this.testMode ? 'wallet_recharge_test' : 'wallet_recharge',
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
      testMode: this.testMode,
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
        note: this.testMode ? 'Verified test UPI recharge' : 'Verified UPI recharge',
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
    destinationInput: string | CashoutDestination,
    requestKey: string,
  ) {
    this.ensureEnabled();
    this.amount(amountPaise, MIN_CASHOUT_PAISE);
    const destination = parseCashoutDestination(destinationInput);
    const replayKey =
      destination.type === 'UPI'
        ? destination.upiId
        : `BANK:${destination.accountNumber}:${destination.ifsc}`;
    const key = this.key(driverId, 'CASHOUT', requestKey);
    const requested = await this.deps.unitOfWork.run(async () => {
      const existing = await this.deps.operations.findByKey(key);
      if (existing) {
        this.checkReplay(existing, amountPaise, replayKey);
        return existing;
      }
      const wallet = await this.wallet(driverId);
      const blocked = this.blocked(wallet);
      if (blocked) throw AppError.conflict(blocked);
      const inFlight = await this.deps.operations.list(driverId, 'CASHOUT');
      if (inFlight.some((entry) => entry.status === 'PENDING' || entry.status === 'PROCESSING'))
        throw AppError.conflict('Your previous cashout is still pending.');
      const earningsPaise = Math.min(amountPaise, wallet.earningsBalancePaise ?? 0);
      const rechargePaise = amountPaise - earningsPaise;
      if (rechargePaise > wallet.balancePaise)
        throw AppError.badRequest('Cashout exceeds your available balance.');
      const operation = {
        ...this.operation(driverId, 'CASHOUT', amountPaise, key),
        earningsPaise,
        rechargePaise,
        destinationUpi: destination.type === 'UPI' ? destination.upiId : null,
        destinationType: destination.type,
        destinationBank:
          destination.type === 'BANK'
            ? {
                accountNumber: destination.accountNumber,
                ifsc: destination.ifsc,
                accountHolderName: destination.accountHolderName,
              }
            : null,
      };
      await this.moveCashout(wallet, operation, false);
      return this.deps.operations.save(operation);
    });
    // Funds are reserved and committed before the provider is called, so a crash here leaves a
    // PENDING operation that `syncCashout` retries safely (the provider call is idempotent).
    return requested.status === 'PENDING' && this.deps.payouts
      ? this.initiatePayout(requested.id).catch(() => requested)
      : requested;
  }

  /** Sends a PENDING cashout to the payout provider. Safe to call repeatedly. */
  async initiatePayout(id: string): Promise<WalletOperation> {
    this.ensureEnabled();
    const payouts = this.deps.payouts;
    const current = await this.deps.operations.find(id);
    if (!current || current.kind !== 'CASHOUT') throw AppError.notFound('Cashout request not found.');
    const destination: CashoutDestination | null =
      current.destinationType === 'BANK' && current.destinationBank
        ? { type: 'BANK', ...current.destinationBank }
        : current.destinationUpi
          ? { type: 'UPI', upiId: current.destinationUpi }
          : null;
    if (!payouts || current.status !== 'PENDING' || !destination) return current;
    const contact = (await this.deps.driverContact?.(current.driverId)) ?? null;
    let payout: ProviderPayout;
    try {
      payout = await payouts.createPayout({
        operationId: current.id,
        amountPaise: current.amountPaise,
        destination,
        driverId: current.driverId,
        name: contact?.name ?? 'Cabzone driver',
        phone: contact?.phone ?? null,
      });
    } catch (error) {
      if (error instanceof PayoutRejectedError)
        return this.applyPayoutStatus(current.id, {
          payoutId: current.providerPaymentId ?? '',
          status: 'rejected',
          utr: null,
          failureReason: error.message,
        });
      throw error; // outcome unknown: stay PENDING and retry through syncCashout
    }
    return this.applyPayoutStatus(current.id, payout);
  }

  /**
   * Moves a cashout to the state the provider reports. Idempotent and safe against webhook
   * redelivery and reordering: final states are never overwritten by in-flight ones.
   */
  async applyPayoutStatus(id: string, payout: ProviderPayout): Promise<WalletOperation> {
    return this.deps.unitOfWork.run(async () => {
      const current = await this.deps.operations.find(id);
      if (!current || current.kind !== 'CASHOUT')
        throw AppError.notFound('Cashout request not found.');
      const failed = ['failed', 'rejected', 'cancelled', 'reversed'].includes(payout.status);
      const next = (patch: Partial<WalletOperation>) =>
        this.deps.operations.save({
          ...current,
          ...patch,
          version: current.version + 1,
          updatedAt: new Date(),
        });
      const inFlight = current.status === 'PENDING' || current.status === 'PROCESSING';
      if (payout.status === 'processed') {
        if (current.status === 'COMPLETED' || current.status === 'REJECTED') return current;
        return next({
          status: 'COMPLETED',
          providerPaymentId: payout.payoutId || current.providerPaymentId,
          transferReference: payout.utr ?? payout.payoutId,
          resolvedBy: 'razorpayx',
        });
      }
      if (failed) {
        // A reversal after "processed" means the bank returned the money: give it back too.
        const returnable = inFlight || (current.status === 'COMPLETED' && payout.status === 'reversed');
        if (!returnable) return current;
        await this.moveCashout(await this.wallet(current.driverId), current, true);
        return next({
          status: 'REJECTED',
          providerPaymentId: payout.payoutId || current.providerPaymentId,
          transferReference: null,
          reason: (payout.failureReason ?? `Payout ${payout.status}`).slice(0, 255),
          resolvedBy: 'razorpayx',
        });
      }
      if (current.status !== 'PENDING') return current;
      return next({ status: 'PROCESSING', providerPaymentId: payout.payoutId });
    });
  }

  /** Re-reads the provider state (or retries a payout that was never sent). */
  async syncCashout(id: string): Promise<WalletOperation> {
    this.ensureEnabled();
    const current = await this.deps.operations.find(id);
    if (!current || current.kind !== 'CASHOUT') throw AppError.notFound('Cashout request not found.');
    if (!this.deps.payouts) return current;
    if (current.providerPaymentId && (current.status === 'PROCESSING' || current.status === 'PENDING'))
      return this.applyPayoutStatus(id, await this.deps.payouts.fetchPayout(current.providerPaymentId));
    return this.initiatePayout(id);
  }

  /** Webhook entry: payout events are keyed by the `reference_id` we set (the operation id). */
  async handlePayoutEvent(referenceId: string, payout: ProviderPayout): Promise<void> {
    const operation = await this.deps.operations.find(referenceId);
    if (!operation || operation.kind !== 'CASHOUT') return;
    await this.applyPayoutStatus(operation.id, payout);
  }

  /** Webhook entry: the order is re-verified against Razorpay, never trusted from the payload. */
  async handleRechargeEvent(orderId: string): Promise<void> {
    const operation = await this.deps.operations.findByOrderId(orderId);
    if (!operation || operation.kind !== 'RECHARGE') return;
    await this.reconcileRecharge(operation.id, operation.driverId);
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
    this.ensureEnabled();
    const detail = referenceOrReason.trim();
    if (detail.length < 5 || detail.length > 255)
      throw AppError.badRequest(
        'Provide a transfer reference or rejection reason (5–255 characters).',
      );
    return this.deps.unitOfWork.run(async () => {
      const current = await this.deps.operations.find(id);
      if (!current || current.kind !== 'CASHOUT')
        throw AppError.notFound('Cashout request not found.');
      if (current.providerPaymentId && current.status === 'PROCESSING')
        throw AppError.conflict('This payout is with the payment provider. Use sync to refresh it.');
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
    const [pending, processing] = await Promise.all([
      this.deps.operations.list(undefined, 'CASHOUT', 'PENDING'),
      this.deps.operations.list(undefined, 'CASHOUT', 'PROCESSING'),
    ]);
    return [...pending, ...processing].map(adminWalletOperationView);
  }
}
