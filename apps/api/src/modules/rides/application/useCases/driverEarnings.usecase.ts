import type {
  DriverEarningsPeriod,
  DriverEarningsReconciliationDto,
  DriverEarningsSummaryDto,
  DriverRideSettlementDto,
  RideEarningsReconciliationIssueDto,
  TransactionReferenceType,
  WalletTransactionDto,
} from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import type { WalletRepositoryPort } from '../../../ledger/ledger.public.js';
import type {
  RideEntity,
  RideEventEntity,
  RideEventRepositoryPort,
  RideRepositoryPort,
} from '../../domain/index.js';
import type { RidePaymentGateway } from '../../domain/ridePayment.port.js';

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const CHUNK_SIZE = 200;

const RIDE_TX_TYPES: readonly TransactionReferenceType[] = [
  'RIDE_COMMISSION',
  'ONLINE_RIDE_EARNINGS',
  'ONLINE_EARNINGS_REVERSAL',
  'DISPUTE_REFUND',
  'CANCELLATION_COMPENSATION',
];

export function computeIstPeriodWindow(
  period: DriverEarningsPeriod,
  now: Date = new Date(),
): { since: Date | null; until: Date } {
  if (period === 'ALL') {
    return { since: null, until: now };
  }
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const startOfTodayUtcMs =
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS;
  if (period === 'TODAY') {
    return { since: new Date(startOfTodayUtcMs), until: now };
  }
  if (period === 'WEEK') {
    return { since: new Date(startOfTodayUtcMs - 6 * DAY_MS), until: now };
  }
  return { since: new Date(startOfTodayUtcMs - 29 * DAY_MS), until: now };
}

function rideFarePaise(ride: RideEntity): number {
  return ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise;
}

function snapshotCommissionPaise(ride: RideEntity, farePaise: number): number {
  const pct = Number.isFinite(ride.pricingSnapshot?.commissionPercent)
    ? ride.pricingSnapshot.commissionPercent
    : 8;
  return Math.round((farePaise * pct) / 100);
}

function anchorTimestamp(ride: RideEntity): Date {
  if (ride.status === 'SETTLED' || ride.status === 'PAYMENT_CONFIRMED') {
    return ride.settledAt ?? ride.completedAt ?? ride.createdAt;
  }
  if (
    ride.status === 'TRIP_COMPLETED' ||
    ride.status === 'PAYMENT_PENDING' ||
    ride.status === 'PAYMENT_CASH_CLAIMED' ||
    ride.status === 'PAYMENT_UNPAID'
  ) {
    return ride.completedAt ?? ride.createdAt;
  }
  if (ride.status === 'PAYMENT_DISPUTED') {
    return ride.updatedAt ?? ride.settledAt ?? ride.completedAt ?? ride.createdAt;
  }
  if (ride.status === 'CANCELLED' || ride.status === 'EXPIRED') {
    return ride.cancelledAt ?? ride.updatedAt ?? ride.createdAt;
  }
  return ride.acceptedAt ?? ride.createdAt;
}

function inWindow(ts: Date, since: Date | null, until: Date): boolean {
  return (since === null || ts >= since) && ts <= until;
}

export interface ReconcileDriverEarningsInput {
  mode?: 'AUDIT' | 'BACKFILL_ONLINE_EARNINGS' | 'RECONCILE_PENDING_ONLINE' | undefined;
  driverId?: string | undefined;
  rideIds?: readonly string[] | undefined;
  adminId?: string | undefined;
  verifyProvider?: boolean | undefined;
}

export class DriverEarningsUseCase {
  constructor(
    private readonly deps: {
      rideRepo: RideRepositoryPort;
      rideEventRepo: RideEventRepositoryPort;
      walletRepo: WalletRepositoryPort;
      unitOfWork: UnitOfWorkPort;
      gateway?: RidePaymentGateway | undefined;
      reconcileOnlineRide?: ((rideId: string, riderId: string) => Promise<RideEntity>) | undefined;
    },
  ) {}

  private async fetchTransactionsForRides(
    rideIds: readonly string[],
  ): Promise<Map<string, WalletTransactionDto[]>> {
    const byRide = new Map<string, WalletTransactionDto[]>();
    for (let i = 0; i < rideIds.length; i += CHUNK_SIZE) {
      const slice = rideIds.slice(i, i + CHUNK_SIZE);
      let offset = 0;
      for (;;) {
        const page = await this.deps.walletRepo.listTransactions({
          referenceIds: slice,
          referenceTypes: RIDE_TX_TYPES,
          limit: 500,
          offset,
        });
        for (const tx of page.items) {
          if (!tx.referenceId) continue;
          const bucket = byRide.get(tx.referenceId) ?? [];
          bucket.push(tx);
          byRide.set(tx.referenceId, bucket);
        }
        offset += page.items.length;
        if (offset >= page.total || page.items.length === 0) break;
      }
    }
    return byRide;
  }

  private async fetchPaymentEventsForRides(
    rideIds: readonly string[],
  ): Promise<Map<string, RideEventEntity[]>> {
    const byRide = new Map<string, RideEventEntity[]>();
    for (let i = 0; i < rideIds.length; i += CHUNK_SIZE) {
      const slice = rideIds.slice(i, i + CHUNK_SIZE);
      const events = await this.deps.rideEventRepo.findByRideIds(slice, [
        'PAYMENT_CONFIRMED',
        'PAYMENT_DISPUTED',
        'PAYMENT_DISPUTE_RESOLVED',
        'UPI_ORDER_CREATED',
        'UPI_QR_CREATED',
        'PAYMENT_METHOD_CHANGED',
      ]);
      for (const ev of events) {
        const list = byRide.get(ev.rideId) ?? [];
        list.push(ev);
        byRide.set(ev.rideId, list);
      }
    }
    return byRide;
  }

  private async verifyProviderForOnlineRide(
    gateway: RidePaymentGateway,
    events: readonly RideEventEntity[],
    farePaise: number,
    expectedPaymentId: string | null,
  ): Promise<{ ok: boolean; detail?: string }> {
    const orderEvent = events.find((e) => e.eventType === 'UPI_ORDER_CREATED');
    const qrEvent = events.find((e) => e.eventType === 'UPI_QR_CREATED');
    const orderId =
      typeof orderEvent?.metadata?.orderId === 'string' ? orderEvent.metadata.orderId : null;
    const qrId = typeof qrEvent?.metadata?.qrId === 'string' ? qrEvent.metadata.qrId : null;

    if (qrId && gateway.live) {
      const captured = await gateway.findQrPayment(qrId, farePaise);
      if (!captured) {
        return {
          ok: false,
          detail: `Provider QR ${qrId} has no captured unrefunded payment for ${farePaise} paise.`,
        };
      }
      if (expectedPaymentId && captured !== expectedPaymentId) {
        return {
          ok: false,
          detail: `Provider QR ${qrId} captured ${captured}, expected ${expectedPaymentId}.`,
        };
      }
      return { ok: true };
    }

    if (orderId && !gateway.live) {
      const captured = await gateway.findCapturedPayment(orderId, farePaise);
      if (!captured) {
        return {
          ok: false,
          detail: `Provider order ${orderId} has no captured unrefunded payment for ${farePaise} paise.`,
        };
      }
      if (expectedPaymentId && captured !== expectedPaymentId) {
        return {
          ok: false,
          detail: `Provider order ${orderId} captured ${captured}, expected ${expectedPaymentId}.`,
        };
      }
      return { ok: true };
    }

    return { ok: true };
  }

  private evaluateRide(
    ride: RideEntity,
    txs: readonly WalletTransactionDto[],
    events: readonly RideEventEntity[],
  ): { settlement: DriverRideSettlementDto; reconciled: boolean } {
    const farePaise = rideFarePaise(ride);
    const snapCommission = snapshotCommissionPaise(ride, farePaise);
    const isSettled = ride.status === 'SETTLED' || ride.status === 'PAYMENT_CONFIRMED';

    if (!isSettled) {
      return {
        reconciled: true,
        settlement: {
          grossPaise: farePaise,
          commissionChargedPaise: snapCommission,
          commissionRefundedPaise: 0,
          netCommissionPaise: snapCommission,
          netEarningsPaise: farePaise - snapCommission,
          settledVia: 'UNSETTLED',
        },
      };
    }

    const onlineTx = txs.find(
      (t) => t.referenceType === 'ONLINE_RIDE_EARNINGS' && t.type === 'CREDIT',
    );
    const onlineReversedPaise = txs
      .filter((t) => t.referenceType === 'ONLINE_EARNINGS_REVERSAL' && t.type === 'DEBIT')
      .reduce((sum, t) => sum + t.amountPaise, 0);
    const commissionDebit = txs.find(
      (t) => t.referenceType === 'RIDE_COMMISSION' && t.type === 'DEBIT',
    );
    const disputeRefundPaise = txs
      .filter((t) => t.referenceType === 'DISPUTE_REFUND' && t.type === 'CREDIT')
      .reduce((sum, t) => sum + t.amountPaise, 0);
    const confirmedEvent = events.find((e) => e.eventType === 'PAYMENT_CONFIRMED');
    const resolutionEvent = events.find((e) => e.eventType === 'PAYMENT_DISPUTE_RESOLVED');
    const isOnlineUpi = Boolean(onlineTx) || confirmedEvent?.metadata?.method === 'UPI';
    const isOnlineRefunded =
      isOnlineUpi &&
      resolutionEvent?.metadata?.outcome === 'RIDER_WINS' &&
      !resolutionEvent?.metadata?.duplicateUpiAfterCash &&
      !resolutionEvent?.metadata?.duplicatePayment;

    if (isOnlineRefunded) {
      const reconciled = onlineTx
        ? onlineReversedPaise === onlineTx.amountPaise && !commissionDebit
        : onlineReversedPaise === 0;
      return {
        reconciled,
        settlement: {
          grossPaise: 0,
          commissionChargedPaise: 0,
          commissionRefundedPaise: 0,
          netCommissionPaise: 0,
          netEarningsPaise: 0,
          ...(onlineReversedPaise > 0 ? { onlineEarningsReversedPaise: onlineReversedPaise } : {}),
          settledVia: 'ONLINE_UPI',
        },
      };
    }

    let commissionChargedPaise: number;
    let reconciled = true;

    if (isOnlineUpi) {
      const eventCommission =
        typeof confirmedEvent?.metadata?.commissionPaise === 'number'
          ? confirmedEvent.metadata.commissionPaise
          : snapCommission;
      const expectedPayable =
        typeof confirmedEvent?.metadata?.driverPayablePaise === 'number'
          ? confirmedEvent.metadata.driverPayablePaise
          : farePaise - eventCommission;

      if (onlineTx) {
        commissionChargedPaise = Math.max(0, farePaise - onlineTx.amountPaise);
        reconciled =
          onlineTx.amountPaise === expectedPayable && !commissionDebit && onlineReversedPaise === 0;
      } else {
        commissionChargedPaise = eventCommission;
        reconciled = expectedPayable === 0 && onlineReversedPaise === 0;
      }
    } else {
      if (commissionDebit) {
        commissionChargedPaise = commissionDebit.amountPaise;
        reconciled = commissionDebit.amountPaise === snapCommission;
      } else {
        commissionChargedPaise = snapCommission;
        reconciled = snapCommission === 0;
      }
    }

    const netCommissionPaise = Math.max(0, commissionChargedPaise - disputeRefundPaise);
    return {
      reconciled,
      settlement: {
        grossPaise: farePaise,
        commissionChargedPaise,
        commissionRefundedPaise: disputeRefundPaise,
        netCommissionPaise,
        netEarningsPaise: farePaise - netCommissionPaise,
        ...(onlineReversedPaise > 0 ? { onlineEarningsReversedPaise: onlineReversedPaise } : {}),
        settledVia: isOnlineUpi ? 'ONLINE_UPI' : 'CASH',
      },
    };
  }

  async buildSettlementMap(
    rides: readonly RideEntity[],
  ): Promise<Map<string, DriverRideSettlementDto>> {
    const result = new Map<string, DriverRideSettlementDto>();
    if (rides.length === 0) return result;
    const settledIds = rides
      .filter((r) => r.status === 'SETTLED' || r.status === 'PAYMENT_CONFIRMED')
      .map((r) => r.id);
    const [txMap, eventMap] =
      settledIds.length > 0
        ? await Promise.all([
            this.fetchTransactionsForRides(settledIds),
            this.fetchPaymentEventsForRides(settledIds),
          ])
        : [new Map<string, WalletTransactionDto[]>(), new Map<string, RideEventEntity[]>()];

    for (const ride of rides) {
      const { settlement } = this.evaluateRide(
        ride,
        txMap.get(ride.id) ?? [],
        eventMap.get(ride.id) ?? [],
      );
      result.set(ride.id, settlement);
    }
    return result;
  }

  async getSummary(
    driverId: string,
    period: DriverEarningsPeriod,
    nowOverride?: Date,
  ): Promise<DriverEarningsSummaryDto> {
    const candidates = await this.deps.rideRepo.listDriverRidesInWindow(
      driverId,
      nowOverride
        ? computeIstPeriodWindow(period, nowOverride).since
        : computeIstPeriodWindow(period).since,
    );
    const now = nowOverride ?? new Date();
    const { since, until } = computeIstPeriodWindow(period, now);

    const periodRides = candidates.filter((r) => inWindow(anchorTimestamp(r), since, until));
    const settledIds = periodRides
      .filter((r) => r.status === 'SETTLED' || r.status === 'PAYMENT_CONFIRMED')
      .map((r) => r.id);
    const cancelledIds = periodRides.filter((r) => r.status === 'CANCELLED').map((r) => r.id);
    const lookupIds = [...settledIds, ...cancelledIds];

    const [txMap, eventMap] =
      lookupIds.length > 0
        ? await Promise.all([
            this.fetchTransactionsForRides(lookupIds),
            settledIds.length > 0
              ? this.fetchPaymentEventsForRides(settledIds)
              : Promise.resolve(new Map<string, RideEventEntity[]>()),
          ])
        : [new Map<string, WalletTransactionDto[]>(), new Map<string, RideEventEntity[]>()];

    let completedTripsCount = 0;
    let cancelledTripsCount = 0;
    let pendingPaymentTripsCount = 0;
    let pendingPaymentGrossPaise = 0;
    let disputedTripsCount = 0;
    let disputedGrossPaise = 0;
    let cashGrossPaise = 0;
    let onlineGrossPaise = 0;
    let commissionChargedPaise = 0;
    let commissionRefundedPaise = 0;
    let onlineEarningsReversedPaise = 0;
    let cancellationCompensationPaise = 0;
    let unreconciledRidesCount = 0;

    for (const ride of periodRides) {
      const farePaise = rideFarePaise(ride);
      if (ride.status === 'SETTLED' || ride.status === 'PAYMENT_CONFIRMED') {
        completedTripsCount += 1;
        const { settlement, reconciled } = this.evaluateRide(
          ride,
          txMap.get(ride.id) ?? [],
          eventMap.get(ride.id) ?? [],
        );
        if (settlement.settledVia === 'ONLINE_UPI') {
          onlineGrossPaise += settlement.grossPaise;
        } else {
          cashGrossPaise += settlement.grossPaise;
        }
        commissionChargedPaise += settlement.commissionChargedPaise;
        commissionRefundedPaise += settlement.commissionRefundedPaise;
        onlineEarningsReversedPaise += settlement.onlineEarningsReversedPaise ?? 0;
        if (!reconciled) unreconciledRidesCount += 1;
      } else if (
        ride.status === 'TRIP_COMPLETED' ||
        ride.status === 'PAYMENT_PENDING' ||
        ride.status === 'PAYMENT_CASH_CLAIMED' ||
        ride.status === 'PAYMENT_UNPAID'
      ) {
        pendingPaymentTripsCount += 1;
        pendingPaymentGrossPaise += farePaise;
      } else if (ride.status === 'PAYMENT_DISPUTED') {
        disputedTripsCount += 1;
        disputedGrossPaise += farePaise;
      } else if (ride.status === 'CANCELLED' || ride.status === 'EXPIRED') {
        cancelledTripsCount += 1;
        const compPaise = (txMap.get(ride.id) ?? [])
          .filter((t) => t.referenceType === 'CANCELLATION_COMPENSATION' && t.type === 'CREDIT')
          .reduce((sum, t) => sum + t.amountPaise, 0);
        cancellationCompensationPaise += compPaise;
      }
    }

    const grossFarePaise = cashGrossPaise + onlineGrossPaise;
    const netCommissionPaise = Math.max(0, commissionChargedPaise - commissionRefundedPaise);

    return {
      period,
      timezone: 'Asia/Kolkata',
      periodStart: since ? since.toISOString() : null,
      periodEnd: until.toISOString(),
      totalAssignedRidesCount: periodRides.length,
      completedTripsCount,
      cancelledTripsCount,
      pendingPaymentTripsCount,
      pendingPaymentGrossPaise,
      disputedTripsCount,
      disputedGrossPaise,
      grossFarePaise,
      cashGrossPaise,
      onlineGrossPaise,
      commissionChargedPaise,
      commissionRefundedPaise,
      netCommissionPaise,
      netEarningsPaise: grossFarePaise - netCommissionPaise,
      ...(onlineEarningsReversedPaise > 0 ? { onlineEarningsReversedPaise } : {}),
      cancellationCompensationPaise,
      unreconciledRidesCount,
    };
  }

  async reconcile(
    input: ReconcileDriverEarningsInput = {},
  ): Promise<DriverEarningsReconciliationDto> {
    const mode = input.mode ?? 'AUDIT';
    if (mode === 'BACKFILL_ONLINE_EARNINGS') {
      if (!input.rideIds || input.rideIds.length === 0) {
        throw AppError.badRequest(
          'Explicit reconciled rideIds are required before backfilling historical online earnings.',
        );
      }
      if (!input.adminId) {
        throw AppError.badRequest('An authenticated finance adminId is required for backfill.');
      }
    }

    const activeGateway =
      this.deps.gateway?.keyId && input.verifyProvider !== false ? this.deps.gateway : undefined;

    const issues: RideEarningsReconciliationIssueDto[] = [];
    const backfilledRideIds: string[] = [];
    const skippedRideIds: string[] = [];
    const reconciledPendingRideIds: string[] = [];
    let checkedPendingOnlineRides = 0;
    let checkedSettledRides = 0;
    let cleanCashRides = 0;
    let cleanOnlineRides = 0;

    // 0. Provider-to-ledger scan & recovery for PAYMENT_PENDING online rides (before settled audit)
    if (activeGateway && (mode === 'AUDIT' || mode === 'RECONCILE_PENDING_ONLINE')) {
      const pendingCandidates: RideEntity[] = [];
      if (input.rideIds && input.rideIds.length > 0) {
        for (const id of new Set(input.rideIds)) {
          const ride = await this.deps.rideRepo.findById(id);
          if (!ride) continue;
          if (input.driverId && ride.driverId !== input.driverId) continue;
          if (
            ride.status === 'PAYMENT_PENDING' ||
            ride.status === 'PAYMENT_CASH_CLAIMED' ||
            ride.status === 'PAYMENT_UNPAID'
          ) {
            pendingCandidates.push(ride);
          }
        }
      } else {
        let offset = 0;
        for (;;) {
          const page = await this.deps.rideRepo.list({
            driverId: input.driverId,
            statuses: ['PAYMENT_PENDING', 'PAYMENT_CASH_CLAIMED', 'PAYMENT_UNPAID'],
            limit: CHUNK_SIZE,
            offset,
          });
          pendingCandidates.push(...page);
          if (page.length < CHUNK_SIZE) break;
          offset += page.length;
        }
      }

      if (pendingCandidates.length > 0) {
        const pendingEventsMap = await this.fetchPaymentEventsForRides(
          pendingCandidates.map((r) => r.id),
        );
        for (const pendingRide of pendingCandidates) {
          const evs = pendingEventsMap.get(pendingRide.id) ?? [];
          const orderEvent = evs.find((e) => e.eventType === 'UPI_ORDER_CREATED');
          const qrEvent = evs.find((e) => e.eventType === 'UPI_QR_CREATED');
          const orderId =
            typeof orderEvent?.metadata?.orderId === 'string' ? orderEvent.metadata.orderId : null;
          const qrId = typeof qrEvent?.metadata?.qrId === 'string' ? qrEvent.metadata.qrId : null;

          if ((!qrId || !activeGateway.live) && (!orderId || activeGateway.live)) {
            continue;
          }
          checkedPendingOnlineRides += 1;
          const farePaise = rideFarePaise(pendingRide) + Math.max(0, pendingRide.arrearsPaise ?? 0);
          const capturedId =
            qrId && activeGateway.live
              ? await activeGateway.findQrPayment(qrId, farePaise)
              : orderId
                ? await activeGateway.findCapturedPayment(orderId, farePaise)
                : null;

          if (!capturedId) continue;

          if (mode === 'RECONCILE_PENDING_ONLINE' && this.deps.reconcileOnlineRide) {
            const updated = await this.deps.reconcileOnlineRide(
              pendingRide.id,
              pendingRide.bookerRiderId,
            );
            if (updated.status === 'SETTLED' || updated.status === 'PAYMENT_DISPUTED') {
              reconciledPendingRideIds.push(pendingRide.id);
            }
          } else {
            issues.push({
              code: 'PROVIDER_CAPTURED_RIDE_UNSETTLED',
              rideId: pendingRide.id,
              driverId: pendingRide.driverId,
              expectedPaise: farePaise,
              actualPaise: 0,
              detail: `Pending online ride has captured provider payment ${capturedId} (${qrId ?? orderId}) that has not been settled in ledger.`,
            });
          }
        }
      }
    }

    // 1. Collect target settled rides
    const targetRides: RideEntity[] = [];
    if (input.rideIds && input.rideIds.length > 0) {
      for (const id of new Set(input.rideIds)) {
        const ride = await this.deps.rideRepo.findById(id);
        if (!ride) {
          issues.push({
            code: 'ORPHAN_LEDGER_RIDE_ENTRY',
            rideId: id,
            driverId: null,
            detail: 'Requested rideId does not exist.',
          });
          continue;
        }
        if (input.driverId && ride.driverId !== input.driverId) continue;
        targetRides.push(ride);
      }
    } else {
      let offset = 0;
      for (;;) {
        const page = await this.deps.rideRepo.list({
          driverId: input.driverId,
          statuses: ['SETTLED', 'PAYMENT_CONFIRMED'],
          limit: CHUNK_SIZE,
          offset,
        });
        targetRides.push(...page);
        if (page.length < CHUNK_SIZE) break;
        offset += page.length;
      }
    }

    const rideIds = targetRides.map((r) => r.id);
    const [txMap, eventMap] =
      rideIds.length > 0
        ? await Promise.all([
            this.fetchTransactionsForRides(rideIds),
            this.fetchPaymentEventsForRides(rideIds),
          ])
        : [new Map<string, WalletTransactionDto[]>(), new Map<string, RideEventEntity[]>()];

    const backfillCandidates = new Set<string>();

    for (const ride of targetRides) {
      if (ride.status !== 'SETTLED' && ride.status !== 'PAYMENT_CONFIRMED') {
        if (
          mode === 'RECONCILE_PENDING_ONLINE' &&
          (ride.status === 'PAYMENT_PENDING' ||
            ride.status === 'PAYMENT_CASH_CLAIMED' ||
            ride.status === 'PAYMENT_UNPAID')
        ) {
          continue;
        }
        issues.push({
          code: 'AMOUNT_MISMATCH',
          rideId: ride.id,
          driverId: ride.driverId,
          detail: `Ride is in status ${ride.status}, not SETTLED.`,
        });
        continue;
      }
      checkedSettledRides += 1;
      const farePaise = rideFarePaise(ride);
      const snapCommission = snapshotCommissionPaise(ride, farePaise);
      const txs = txMap.get(ride.id) ?? [];
      const events = eventMap.get(ride.id) ?? [];

      const onlineTxs = txs.filter(
        (t) => t.referenceType === 'ONLINE_RIDE_EARNINGS' && t.type === 'CREDIT',
      );
      const onlineReversals = txs.filter(
        (t) => t.referenceType === 'ONLINE_EARNINGS_REVERSAL' && t.type === 'DEBIT',
      );
      const reversedSum = onlineReversals.reduce((s, t) => s + t.amountPaise, 0);
      const commissionDebits = txs.filter(
        (t) => t.referenceType === 'RIDE_COMMISSION' && t.type === 'DEBIT',
      );
      const invalidCommissionCredits = txs.filter(
        (t) => t.referenceType === 'RIDE_COMMISSION' && t.type !== 'DEBIT',
      );
      if (invalidCommissionCredits.length > 0) {
        issues.push({
          code: 'AMOUNT_MISMATCH',
          rideId: ride.id,
          driverId: ride.driverId,
          transactionId: invalidCommissionCredits[0]!.id,
          detail: 'RIDE_COMMISSION entry has non-DEBIT transaction type.',
        });
        continue;
      }

      const confirmedEvent = events.find((e) => e.eventType === 'PAYMENT_CONFIRMED');
      const resolutionEvent = events.find((e) => e.eventType === 'PAYMENT_DISPUTE_RESOLVED');
      const isOnlineUpi = onlineTxs.length > 0 || confirmedEvent?.metadata?.method === 'UPI';
      const isOnlineRefunded =
        isOnlineUpi &&
        resolutionEvent?.metadata?.outcome === 'RIDER_WINS' &&
        !resolutionEvent?.metadata?.duplicateUpiAfterCash &&
      !resolutionEvent?.metadata?.duplicatePayment;

      if (isOnlineUpi) {
        const eventCommission =
          typeof confirmedEvent?.metadata?.commissionPaise === 'number'
            ? confirmedEvent.metadata.commissionPaise
            : snapCommission;
        const expectedPayable =
          typeof confirmedEvent?.metadata?.driverPayablePaise === 'number'
            ? confirmedEvent.metadata.driverPayablePaise
            : farePaise - eventCommission;

        if (commissionDebits.length > 0) {
          issues.push({
            code: 'AMOUNT_MISMATCH',
            rideId: ride.id,
            driverId: ride.driverId,
            transactionId: commissionDebits[0]!.id,
            expectedPaise: 0,
            actualPaise: commissionDebits[0]!.amountPaise,
            detail: 'Online UPI ride unexpectedly also has a cash RIDE_COMMISSION debit.',
          });
          continue;
        }

        if (onlineTxs.length > 1) {
          issues.push({
            code: 'AMOUNT_MISMATCH',
            rideId: ride.id,
            driverId: ride.driverId,
            expectedPaise: expectedPayable,
            actualPaise: onlineTxs.reduce((s, t) => s + t.amountPaise, 0),
            detail: 'Multiple ONLINE_RIDE_EARNINGS entries exist for one ride.',
          });
          continue;
        }

        if (isOnlineRefunded) {
          if (onlineTxs.length === 1 && reversedSum !== onlineTxs[0]!.amountPaise) {
            issues.push({
              code: 'ONLINE_REFUND_MISSING_REVERSAL',
              rideId: ride.id,
              driverId: ride.driverId,
              transactionId: onlineTxs[0]!.id,
              expectedPaise: onlineTxs[0]!.amountPaise,
              actualPaise: reversedSum,
              detail:
                'Online UPI dispute resolved in rider favor is missing matching ONLINE_EARNINGS_REVERSAL debit.',
            });
          } else {
            cleanOnlineRides += 1;
            if (mode === 'BACKFILL_ONLINE_EARNINGS') {
              skippedRideIds.push(ride.id);
            }
          }
          continue;
        }

        if (reversedSum > 0) {
          issues.push({
            code: 'AMOUNT_MISMATCH',
            rideId: ride.id,
            driverId: ride.driverId,
            transactionId: onlineReversals[0]!.id,
            expectedPaise: 0,
            actualPaise: reversedSum,
            detail: 'ONLINE_EARNINGS_REVERSAL exists without a RIDER_WINS dispute resolution.',
          });
          continue;
        }

        const expectedPaymentId =
          typeof confirmedEvent?.metadata?.paymentId === 'string' &&
          confirmedEvent.metadata.paymentId.trim()
            ? confirmedEvent.metadata.paymentId.trim()
            : null;

        if (activeGateway) {
          const providerCheck = await this.verifyProviderForOnlineRide(
            activeGateway,
            events,
            farePaise + Math.max(0, ride.arrearsPaise ?? 0),
            expectedPaymentId,
          );
          if (!providerCheck.ok) {
            issues.push({
              code: 'PROVIDER_SETTLEMENT_MISMATCH',
              rideId: ride.id,
              driverId: ride.driverId,
              expectedPaise: farePaise,
              actualPaise: 0,
              detail:
                providerCheck.detail ??
                'Settled online ride could not be verified with payment provider.',
            });
            continue;
          }
        }

        if (onlineTxs.length === 1) {
          const actual = onlineTxs[0]!.amountPaise;
          if (actual !== expectedPayable) {
            issues.push({
              code: 'AMOUNT_MISMATCH',
              rideId: ride.id,
              driverId: ride.driverId,
              transactionId: onlineTxs[0]!.id,
              expectedPaise: expectedPayable,
              actualPaise: actual,
              detail: 'Posted ONLINE_RIDE_EARNINGS differs from expected driverPayablePaise.',
            });
          } else {
            cleanOnlineRides += 1;
            if (mode === 'BACKFILL_ONLINE_EARNINGS') {
              skippedRideIds.push(ride.id);
            }
          }
          continue;
        }

        // onlineTxs.length === 0
        if (expectedPayable <= 0) {
          cleanOnlineRides += 1;
          continue;
        }

        const wallet = ride.driverId
          ? await this.deps.walletRepo.findByDriverId(ride.driverId)
          : null;
        if (!ride.driverId || !wallet) {
          issues.push({
            code: 'MISSING_DRIVER_WALLET',
            rideId: ride.id,
            driverId: ride.driverId,
            expectedPaise: expectedPayable,
            actualPaise: 0,
            detail: 'Driver wallet is missing for settled online UPI ride.',
          });
          continue;
        }

        if (!expectedPaymentId) {
          issues.push({
            code: 'AMOUNT_MISMATCH',
            rideId: ride.id,
            driverId: ride.driverId,
            expectedPaise: expectedPayable,
            actualPaise: 0,
            detail:
              'Online UPI ride is missing verified provider paymentId in PAYMENT_CONFIRMED event.',
          });
          continue;
        }

        if (mode === 'BACKFILL_ONLINE_EARNINGS') {
          backfillCandidates.add(ride.id);
        } else {
          issues.push({
            code: 'HISTORICAL_ONLINE_MISSING_EARNINGS',
            rideId: ride.id,
            driverId: ride.driverId,
            expectedPaise: expectedPayable,
            actualPaise: 0,
            detail: `Historical online UPI ride (${expectedPaymentId}) has no ONLINE_RIDE_EARNINGS ledger credit; verify no external payout was sent before backfilling.`,
          });
        }
      } else {
        if (commissionDebits.length === 0) {
          if (snapCommission === 0) {
            cleanCashRides += 1;
          } else {
            issues.push({
              code: 'CASH_MISSING_COMMISSION',
              rideId: ride.id,
              driverId: ride.driverId,
              expectedPaise: snapCommission,
              actualPaise: 0,
              detail: 'Settled cash/direct ride is missing RIDE_COMMISSION debit.',
            });
          }
          continue;
        }
        const totalDebited = commissionDebits.reduce((s, t) => s + t.amountPaise, 0);
        if (commissionDebits.length > 1 || totalDebited !== snapCommission) {
          issues.push({
            code: 'AMOUNT_MISMATCH',
            rideId: ride.id,
            driverId: ride.driverId,
            transactionId: commissionDebits[0]!.id,
            expectedPaise: snapCommission,
            actualPaise: totalDebited,
            detail: 'Posted RIDE_COMMISSION debit does not match ride pricing snapshot.',
          });
        } else {
          cleanCashRides += 1;
        }
      }
    }

    // 2. In AUDIT mode without specific rideIds, also detect orphan ride-referenced ledger entries
    if (mode === 'AUDIT' && (!input.rideIds || input.rideIds.length === 0)) {
      const rideExistenceCache = new Map<string, boolean>(targetRides.map((r) => [r.id, true]));
      let offset = 0;
      for (;;) {
        const page = await this.deps.walletRepo.listTransactions({
          ...(input.driverId ? { driverId: input.driverId } : {}),
          referenceTypes: [
            'RIDE_COMMISSION',
            'ONLINE_RIDE_EARNINGS',
            'ONLINE_EARNINGS_REVERSAL',
            'DISPUTE_REFUND',
          ],
          limit: CHUNK_SIZE,
          offset,
        });
        for (const tx of page.items) {
          if (!tx.referenceId) {
            issues.push({
              code: 'ORPHAN_LEDGER_RIDE_ENTRY',
              rideId: null,
              driverId: tx.driverId ?? null,
              transactionId: tx.id,
              actualPaise: tx.amountPaise,
              detail: `${tx.referenceType} transaction has null referenceId.`,
            });
            continue;
          }
          let exists = rideExistenceCache.get(tx.referenceId);
          if (exists === undefined) {
            exists = (await this.deps.rideRepo.findById(tx.referenceId)) !== null;
            rideExistenceCache.set(tx.referenceId, exists);
          }
          if (!exists) {
            issues.push({
              code: 'ORPHAN_LEDGER_RIDE_ENTRY',
              rideId: tx.referenceId,
              driverId: tx.driverId ?? null,
              transactionId: tx.id,
              actualPaise: tx.amountPaise,
              detail: `${tx.referenceType} references non-existent ride ${tx.referenceId}.`,
            });
          } else if (tx.referenceType === 'RIDE_COMMISSION' && tx.type !== 'DEBIT') {
            issues.push({
              code: 'AMOUNT_MISMATCH',
              rideId: tx.referenceId,
              driverId: tx.driverId ?? null,
              transactionId: tx.id,
              actualPaise: tx.amountPaise,
              detail: 'RIDE_COMMISSION transaction must be a DEBIT.',
            });
          }
        }
        offset += page.items.length;
        if (offset >= page.total || page.items.length === 0) break;
      }
    }

    // 3. Execute guarded, idempotent backfill ONLY for rides that passed all reconciliation checks
    if (mode === 'BACKFILL_ONLINE_EARNINGS' && backfillCandidates.size > 0) {
      for (const rideId of backfillCandidates) {
        await this.deps.unitOfWork.run(async () => {
          const existing = await this.deps.walletRepo.findTransactionByIdempotencyKey(
            `ride-earnings:${rideId}`,
          );
          if (existing) {
            skippedRideIds.push(rideId);
            return;
          }
          const currentRide = await this.deps.rideRepo.findById(rideId);
          if (
            !currentRide ||
            !currentRide.driverId ||
            (currentRide.status !== 'SETTLED' && currentRide.status !== 'PAYMENT_CONFIRMED')
          ) {
            skippedRideIds.push(rideId);
            return;
          }
          const events = await this.deps.rideEventRepo.findByRideId(rideId);
          const confirmedEvent = events.find((e) => e.eventType === 'PAYMENT_CONFIRMED');
          const farePaise = rideFarePaise(currentRide);
          const snapCommission = snapshotCommissionPaise(currentRide, farePaise);
          const eventCommission =
            typeof confirmedEvent?.metadata?.commissionPaise === 'number'
              ? confirmedEvent.metadata.commissionPaise
              : snapCommission;
          const payablePaise =
            typeof confirmedEvent?.metadata?.driverPayablePaise === 'number'
              ? confirmedEvent.metadata.driverPayablePaise
              : farePaise - eventCommission;
          if (payablePaise <= 0) {
            skippedRideIds.push(rideId);
            return;
          }
          const wallet = await this.deps.walletRepo.findByDriverId(currentRide.driverId);
          if (!wallet) {
            issues.push({
              code: 'MISSING_DRIVER_WALLET',
              rideId,
              driverId: currentRide.driverId,
              expectedPaise: payablePaise,
              actualPaise: 0,
              detail: 'Driver wallet missing during backfill transaction.',
            });
            return;
          }
          const now = new Date();
          const before = wallet.balancePaise;
          const after = before + payablePaise;
          await this.deps.walletRepo.save({
            ...wallet,
            balancePaise: after,
            owedPaise: Math.max(0, -after),
            version: wallet.version + 1,
            updatedAt: now,
          });
          await this.deps.walletRepo.recordTransaction({
            id: newUuid(),
            walletId: wallet.id,
            driverId: currentRide.driverId,
            bucket: 'COMMISSION',
            type: 'CREDIT',
            amountPaise: payablePaise,
            referenceType: 'ONLINE_RIDE_EARNINGS',
            referenceId: currentRide.id,
            idempotencyKey: `ride-earnings:${currentRide.id}`,
            balanceBeforePaise: before,
            balanceAfterPaise: after,
            createdBy: input.adminId ?? null,
            note: 'Reconciled historical online ride earnings backfill',
            createdAt: now,
          });
          await this.deps.rideEventRepo.save({
            id: newUuid(),
            rideId: currentRide.id,
            eventType: 'HISTORICAL_EARNINGS_RECONCILED',
            actorType: 'ADMIN',
            actorId: input.adminId ?? null,
            previousStatus: currentRide.status,
            newStatus: currentRide.status,
            metadata: {
              farePaise,
              commissionPaise: eventCommission,
              driverPayablePaise: payablePaise,
              paymentId: confirmedEvent?.metadata?.paymentId ?? null,
            },
            createdAt: now,
          });
          backfilledRideIds.push(currentRide.id);
          cleanOnlineRides += 1;
        });
      }
    }

    if (mode === 'BACKFILL_ONLINE_EARNINGS' && input.rideIds) {
      const backfilledSet = new Set(backfilledRideIds);
      const skippedSet = new Set(skippedRideIds);
      for (const requestedId of input.rideIds) {
        if (!backfilledSet.has(requestedId) && !skippedSet.has(requestedId)) {
          skippedRideIds.push(requestedId);
          skippedSet.add(requestedId);
        }
      }
    }

    return {
      mode,
      checkedSettledRides,
      cleanCashRides,
      cleanOnlineRides,
      backfilledRideIds,
      skippedRideIds,
      ...(checkedPendingOnlineRides > 0 || mode === 'RECONCILE_PENDING_ONLINE'
        ? { checkedPendingOnlineRides, reconciledPendingRideIds }
        : {}),
      issues,
    };
  }
}
