import type {
  TransactionReferenceType,
  WalletLedgerReconciliationDto,
  WalletLedgerReconciliationIssueDto,
} from '@cabzone/contracts';
import type { WalletEntity } from '../../domain/wallet.entity.js';
import type { WalletRepositoryPort } from '../../domain/wallet.port.js';
import type { WalletTransactionEntity } from '../../domain/walletTransaction.entity.js';
import type {
  WalletOperationRepository,
  WalletPaymentGateway,
} from '../../domain/walletOperation.port.js';
import type { WalletMoneyUseCase } from './walletMoney.usecase.js';

const SINGLE_EVENT_REF_TYPES = new Set<TransactionReferenceType>([
  'RIDE_COMMISSION',
  'ONLINE_RIDE_EARNINGS',
  'DISPUTE_REFUND',
  'WALLET_RECHARGE',
]);

const BUCKET_SCOPED_SINGLE_REF_TYPES = new Set<TransactionReferenceType>([
  'WALLET_CASHOUT',
  'CASHOUT_REVERSAL',
  'ONLINE_EARNINGS_REVERSAL',
]);

function signedDelta(tx: WalletTransactionEntity): number {
  return tx.type === 'CREDIT' || tx.type === 'REVERSAL' ? tx.amountPaise : -tx.amountPaise;
}

/**
 * Verifies a bucket's immutable transaction chain using multiset telescoping of
 * (balanceBeforePaise -> balanceAfterPaise) so same-millisecond writes and seeded
 * opening balances are evaluated deterministically without false positives.
 */
function verifyBucketChain(
  wallet: WalletEntity,
  bucket: 'COMMISSION' | 'EARNINGS',
  txs: readonly WalletTransactionEntity[],
  currentBalancePaise: number,
  issues: WalletLedgerReconciliationIssueDto[],
): boolean {
  if (txs.length === 0) return true;
  let clean = true;

  for (const tx of txs) {
    const expectedAfter = tx.balanceBeforePaise + signedDelta(tx);
    if (expectedAfter !== tx.balanceAfterPaise) {
      clean = false;
      issues.push({
        code: 'BROKEN_TX_BALANCE_STEP',
        walletId: wallet.id,
        driverId: wallet.driverId || null,
        transactionId: tx.id,
        bucket,
        expectedPaise: expectedAfter,
        actualPaise: tx.balanceAfterPaise,
        detail: `${bucket} transaction ${tx.id} has before=${tx.balanceBeforePaise}, delta=${signedDelta(tx)}, after=${tx.balanceAfterPaise}.`,
      });
    }
  }

  const links = new Map<number, Set<number>>();
  for (const tx of txs) {
    for (const [from, to] of [
      [tx.balanceBeforePaise, tx.balanceAfterPaise],
      [tx.balanceAfterPaise, tx.balanceBeforePaise],
    ] as const) {
      if (!links.has(from)) links.set(from, new Set());
      links.get(from)!.add(to);
    }
  }
  const reached = new Set<number>();
  const pending = [txs[0]!.balanceBeforePaise];
  while (pending.length) {
    const balance = pending.pop()!;
    if (reached.has(balance)) continue;
    reached.add(balance);
    for (const next of links.get(balance) ?? []) pending.push(next);
  }
  if (reached.size !== links.size) {
    clean = false;
    issues.push({
      code: 'BROKEN_TX_CHAIN',
      walletId: wallet.id,
      driverId: wallet.driverId || null,
      bucket,
      actualPaise: currentBalancePaise,
      detail: `${bucket} ledger contains disconnected transaction chains.`,
    });
  }

  const beforeCounts = new Map<number, number>();
  const afterCounts = new Map<number, number>();
  for (const tx of txs) {
    beforeCounts.set(tx.balanceBeforePaise, (beforeCounts.get(tx.balanceBeforePaise) ?? 0) + 1);
    afterCounts.set(tx.balanceAfterPaise, (afterCounts.get(tx.balanceAfterPaise) ?? 0) + 1);
  }

  for (const [val, bCount] of [...beforeCounts.entries()]) {
    const aCount = afterCounts.get(val) ?? 0;
    const cancel = Math.min(bCount, aCount);
    if (cancel > 0) {
      if (bCount === cancel) beforeCounts.delete(val);
      else beforeCounts.set(val, bCount - cancel);
      if (aCount === cancel) afterCounts.delete(val);
      else afterCounts.set(val, aCount - cancel);
    }
  }

  const unpairedBefores: number[] = [];
  for (const [val, cnt] of beforeCounts) {
    for (let i = 0; i < cnt; i++) unpairedBefores.push(val);
  }
  const unpairedAfters: number[] = [];
  for (const [val, cnt] of afterCounts) {
    for (let i = 0; i < cnt; i++) unpairedAfters.push(val);
  }

  if (unpairedBefores.length === 0 && unpairedAfters.length === 0) {
    // Closed cycle (net delta == 0, e.g. 500 -> 400 -> 500): current balance must be a node in the cycle
    const visitedBalances = new Set(txs.map((t) => t.balanceAfterPaise));
    if (!visitedBalances.has(currentBalancePaise)) {
      clean = false;
      issues.push({
        code: 'WALLET_BALANCE_DRIFT',
        walletId: wallet.id,
        driverId: wallet.driverId || null,
        bucket,
        actualPaise: currentBalancePaise,
        detail: `${bucket} balance (${currentBalancePaise}) does not match closed ledger cycle.`,
      });
    }
    return clean;
  }

  if (unpairedBefores.length !== 1 || unpairedAfters.length !== 1) {
    clean = false;
    issues.push({
      code: 'BROKEN_TX_CHAIN',
      walletId: wallet.id,
      driverId: wallet.driverId || null,
      bucket,
      actualPaise: currentBalancePaise,
      detail: `${bucket} ledger has ${unpairedBefores.length} chain start(s) and ${unpairedAfters.length} chain end(s); non-atomic concurrent overwrite or missing link.`,
    });
    return clean;
  }

  const closingBalance = unpairedAfters[0]!;
  if (closingBalance !== currentBalancePaise) {
    clean = false;
    issues.push({
      code: 'WALLET_BALANCE_DRIFT',
      walletId: wallet.id,
      driverId: wallet.driverId || null,
      bucket,
      expectedPaise: closingBalance,
      actualPaise: currentBalancePaise,
      detail: `Materialized ${bucket} balance (${currentBalancePaise}) disagrees with ledger closing balance (${closingBalance}).`,
    });
  }

  return clean;
}

export class ReconcileWalletLedgerUseCase {
  constructor(
    private readonly deps: {
      walletRepo: WalletRepositoryPort;
      operations?: WalletOperationRepository | undefined;
      gateway?: WalletPaymentGateway | undefined;
      walletMoneyUseCase?: WalletMoneyUseCase | undefined;
    },
  ) {}

  async execute(
    input: {
      mode?: 'AUDIT' | 'RECONCILE_PENDING_RECHARGES' | undefined;
      driverId?: string | undefined;
    } = {},
  ): Promise<WalletLedgerReconciliationDto> {
    const mode = input.mode ?? 'AUDIT';
    const activeGateway = this.deps.gateway?.keyId ? this.deps.gateway : undefined;
    const issues: WalletLedgerReconciliationIssueDto[] = [];
    const reconciledRechargeIds: string[] = [];

    // 1. Reconcile pending captured recharges first when requested so subsequent audit reflects clean state
    const initialOps = this.deps.operations ? await this.deps.operations.list(input.driverId) : [];
    if (mode === 'RECONCILE_PENDING_RECHARGES' && activeGateway && this.deps.walletMoneyUseCase) {
      for (const op of initialOps) {
        if (op.kind === 'RECHARGE' && op.status === 'CREATED' && op.orderId) {
          const captured = await activeGateway.findCapturedPayment(op.orderId, op.amountPaise);
          if (captured) {
            const updated = await this.deps.walletMoneyUseCase.reconcileRecharge(
              op.id,
              op.driverId,
            );
            if (updated.status === 'COMPLETED') {
              reconciledRechargeIds.push(op.id);
            }
          }
        }
      }
    }

    const wallets: WalletEntity[] = this.deps.walletRepo.findAllWallets
      ? await this.deps.walletRepo.findAllWallets(input.driverId)
      : input.driverId
        ? [await this.deps.walletRepo.findByDriverId(input.driverId)].filter(
            (w): w is WalletEntity => w !== null,
          )
        : [];

    let cleanWallets = 0;
    const txsByWallet = new Map<string, WalletTransactionEntity[]>();

    for (const wallet of wallets) {
      const txs = await this.deps.walletRepo.findTransactionsByWalletId(wallet.id);
      txsByWallet.set(wallet.id, txs);

      const commissionTxs = txs.filter((t) => (t.bucket ?? 'COMMISSION') === 'COMMISSION');
      const earningsTxs = txs.filter((t) => t.bucket === 'EARNINGS');

      const cOk = verifyBucketChain(
        wallet,
        'COMMISSION',
        commissionTxs,
        wallet.balancePaise,
        issues,
      );
      const eOk = verifyBucketChain(
        wallet,
        'EARNINGS',
        earningsTxs,
        wallet.earningsBalancePaise ?? 0,
        issues,
      );

      let dupFound = false;
      const seenEventKeys = new Map<string, WalletTransactionEntity>();
      for (const tx of txs) {
        if (!tx.referenceId) continue;
        let eventKey: string | null = null;
        if (SINGLE_EVENT_REF_TYPES.has(tx.referenceType)) {
          const action =
            tx.referenceType === 'DISPUTE_REFUND'
              ? tx.idempotencyKey === `dispute_arrears_refund_${tx.referenceId}`
                ? ':ARREARS'
                : ':COMMISSION'
              : '';
          eventKey = `${tx.referenceType}:${tx.referenceId}${action}`;
        } else if (BUCKET_SCOPED_SINGLE_REF_TYPES.has(tx.referenceType)) {
          eventKey = `${tx.referenceType}:${tx.referenceId}:${tx.bucket ?? 'COMMISSION'}`;
        }
        if (eventKey) {
          const prev = seenEventKeys.get(eventKey);
          if (prev) {
            dupFound = true;
            issues.push({
              code: 'DUPLICATE_EVENT_POSTING',
              walletId: wallet.id,
              driverId: wallet.driverId || null,
              transactionId: tx.id,
              bucket: tx.bucket ?? 'COMMISSION',
              actualPaise: tx.amountPaise,
              detail: `Duplicate ${tx.referenceType} posting for reference ${tx.referenceId}.`,
            });
          } else {
            seenEventKeys.set(eventKey, tx);
          }
        }
      }

      if (cOk && eOk && !dupFound) {
        cleanWallets += 1;
      }
    }

    // 2. Provider & WalletOperation cross-check
    const operations = this.deps.operations ? await this.deps.operations.list(input.driverId) : [];
    for (const op of operations) {
      const driverWallet =
        wallets.find((w) => w.driverId === op.driverId) ??
        (await this.deps.walletRepo.findByDriverId(op.driverId));
      const walletTxs = driverWallet
        ? (txsByWallet.get(driverWallet.id) ??
          (await this.deps.walletRepo.findTransactionsByWalletId(driverWallet.id)))
        : [];

      if (op.kind === 'RECHARGE') {
        if (op.status === 'COMPLETED') {
          const rechargeCredits = walletTxs.filter(
            (t) =>
              t.referenceType === 'WALLET_RECHARGE' &&
              t.referenceId === op.id &&
              t.type === 'CREDIT',
          );
          const totalCredited = rechargeCredits.reduce((s, t) => s + t.amountPaise, 0);
          if (rechargeCredits.length !== 1 || totalCredited !== op.amountPaise) {
            issues.push({
              code: 'MISSING_RECHARGE_LEDGER_ENTRY',
              walletId: driverWallet?.id ?? null,
              driverId: op.driverId,
              operationId: op.id,
              expectedPaise: op.amountPaise,
              actualPaise: totalCredited,
              detail: `Completed recharge ${op.id} expected ${op.amountPaise} paise credit, found ${totalCredited} (${rechargeCredits.length} entry/entries).`,
            });
          }
          if (activeGateway && op.orderId) {
            const providerPaymentId = await activeGateway.findCapturedPayment(
              op.orderId,
              op.amountPaise,
            );
            if (
              !providerPaymentId ||
              (op.providerPaymentId && providerPaymentId !== op.providerPaymentId)
            ) {
              issues.push({
                code: 'PROVIDER_PAYMENT_UNVERIFIED',
                walletId: driverWallet?.id ?? null,
                driverId: op.driverId,
                operationId: op.id,
                expectedPaise: op.amountPaise,
                detail: `Completed recharge ${op.id} (order ${op.orderId}) could not be verified with provider payment ${op.providerPaymentId ?? 'null'}.`,
              });
            }
          }
        } else if (op.status === 'CREATED' && op.orderId && activeGateway) {
          const captured = await activeGateway.findCapturedPayment(op.orderId, op.amountPaise);
          if (captured) {
            issues.push({
              code: 'UNRECONCILED_CAPTURED_RECHARGE',
              walletId: driverWallet?.id ?? null,
              driverId: op.driverId,
              operationId: op.id,
              expectedPaise: op.amountPaise,
              actualPaise: 0,
              detail: `Recharge ${op.id} (order ${op.orderId}) has captured provider payment ${captured} but has not been credited.`,
            });
          }
        }
      } else if (op.kind === 'CASHOUT') {
        const holdDebits = walletTxs.filter(
          (t) =>
            t.referenceType === 'WALLET_CASHOUT' && t.referenceId === op.id && t.type === 'DEBIT',
        );
        const holdSum = holdDebits.reduce((s, t) => s + t.amountPaise, 0);
        if (holdSum !== op.amountPaise) {
          issues.push({
            code: 'CASHOUT_LEDGER_MISMATCH',
            walletId: driverWallet?.id ?? null,
            driverId: op.driverId,
            operationId: op.id,
            expectedPaise: op.amountPaise,
            actualPaise: holdSum,
            detail: `Cashout ${op.id} reserved ${holdSum} paise in ledger vs operation amount ${op.amountPaise}.`,
          });
        }

        const reversals = walletTxs.filter(
          (t) => t.referenceType === 'CASHOUT_REVERSAL' && t.referenceId === op.id,
        );
        const reversalSum = reversals.reduce((s, t) => s + t.amountPaise, 0);

        if (op.status === 'REJECTED' && reversalSum !== op.amountPaise) {
          issues.push({
            code: 'CASHOUT_LEDGER_MISMATCH',
            walletId: driverWallet?.id ?? null,
            driverId: op.driverId,
            operationId: op.id,
            expectedPaise: op.amountPaise,
            actualPaise: reversalSum,
            detail: `Rejected cashout ${op.id} returned ${reversalSum} paise vs expected ${op.amountPaise}.`,
          });
        } else if (op.status === 'COMPLETED') {
          if (reversalSum > 0 || !op.transferReference) {
            issues.push({
              code: 'CASHOUT_LEDGER_MISMATCH',
              walletId: driverWallet?.id ?? null,
              driverId: op.driverId,
              operationId: op.id,
              expectedPaise: 0,
              actualPaise: reversalSum,
              detail: !op.transferReference
                ? `Completed cashout ${op.id} is missing transferReference.`
                : `Completed cashout ${op.id} unexpectedly also has a CASHOUT_REVERSAL credit.`,
            });
          }
        }
      }
    }

    return {
      mode,
      checkedWallets: wallets.length,
      cleanWallets,
      checkedOperations: operations.length,
      reconciledRechargeIds,
      issues,
    };
  }
}
