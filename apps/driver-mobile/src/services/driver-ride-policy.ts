import type { RideDto, RideEventDto } from '@cabzone/contracts';

export const DEFAULT_CANCELLATION_FEE_PAISE = 5000;
export const DEFAULT_DRIVER_NO_SHOW_WAIT_SECONDS = 300;
export const DEFAULT_DRIVER_COMPENSATION_PAISE = 2500;
export const RATING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function formatInrTwoDecimals(paise: number): string {
  const safe = Number.isFinite(paise) ? paise : 0;
  return `₹${(safe / 100).toFixed(2)}`;
}

export function formatWaitDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export interface DriverCashAvailability {
  cashAllowed: boolean;
  arrearsPaise: number;
  cashBlockThresholdPaise: number;
  reason: string | null;
}

export function resolveDriverCashAvailability(
  ride: Pick<RideDto, 'arrearsPaise' | 'pricingSnapshot'>,
): DriverCashAvailability {
  const arrearsPaise = Math.max(0, ride.arrearsPaise ?? 0);
  const rawThreshold = ride.pricingSnapshot?.cancellationFeePaise ?? DEFAULT_CANCELLATION_FEE_PAISE;
  const cashBlockThresholdPaise = rawThreshold > 0 ? rawThreshold : DEFAULT_CANCELLATION_FEE_PAISE;
  const cashAllowed = arrearsPaise < cashBlockThresholdPaise;

  return {
    cashAllowed,
    arrearsPaise,
    cashBlockThresholdPaise,
    reason: cashAllowed
      ? null
      : `Cash collection is disabled while ${formatInrTwoDecimals(arrearsPaise)} in prior rider cancellation fees is due. Ask the rider to scan the UPI QR for the full total.`,
  };
}

export interface DriverNoShowStatus {
  canMarkNoShow: boolean;
  elapsedWaitSeconds: number;
  remainingWaitSeconds: number;
  waitThresholdSeconds: number;
  driverCompensationPaise: number;
  cancellationFeePaise: number;
  statusText: string;
}

export function resolveDriverNoShowStatus(
  ride: Pick<RideDto, 'status' | 'arrivedAt' | 'updatedAt' | 'pricingSnapshot'>,
  nowMs: number = Date.now(),
): DriverNoShowStatus {
  const waitThresholdSeconds =
    typeof ride.pricingSnapshot?.driverNoShowWaitSeconds === 'number' &&
    Number.isFinite(ride.pricingSnapshot.driverNoShowWaitSeconds)
      ? Math.max(0, ride.pricingSnapshot.driverNoShowWaitSeconds)
      : DEFAULT_DRIVER_NO_SHOW_WAIT_SECONDS;

  const cancellationFeePaise =
    typeof ride.pricingSnapshot?.cancellationFeePaise === 'number' &&
    Number.isFinite(ride.pricingSnapshot.cancellationFeePaise)
      ? Math.max(0, ride.pricingSnapshot.cancellationFeePaise)
      : DEFAULT_CANCELLATION_FEE_PAISE;

  const driverCompensationPaise =
    typeof ride.pricingSnapshot?.driverCompensationPaise === 'number' &&
    Number.isFinite(ride.pricingSnapshot.driverCompensationPaise)
      ? Math.max(0, ride.pricingSnapshot.driverCompensationPaise)
      : DEFAULT_DRIVER_COMPENSATION_PAISE;

  if (ride.status !== 'DRIVER_ARRIVED') {
    return {
      canMarkNoShow: false,
      elapsedWaitSeconds: 0,
      remainingWaitSeconds: waitThresholdSeconds,
      waitThresholdSeconds,
      driverCompensationPaise,
      cancellationFeePaise,
      statusText: `Mark arrival at pickup and wait ${formatWaitDuration(waitThresholdSeconds)} before cancelling as Passenger did not arrive.`,
    };
  }

  const anchorIso = ride.arrivedAt ?? ride.updatedAt;
  const anchorMs = Date.parse(anchorIso);
  const elapsedWaitSeconds =
    Number.isFinite(anchorMs) && anchorMs <= nowMs ? Math.floor((nowMs - anchorMs) / 1000) : 0;
  const remainingWaitSeconds = Math.max(0, waitThresholdSeconds - elapsedWaitSeconds);
  const canMarkNoShow = elapsedWaitSeconds >= waitThresholdSeconds;

  const compNote =
    driverCompensationPaise > 0
      ? ` (${formatInrTwoDecimals(driverCompensationPaise)} driver compensation)`
      : '';

  return {
    canMarkNoShow,
    elapsedWaitSeconds,
    remainingWaitSeconds,
    waitThresholdSeconds,
    driverCompensationPaise,
    cancellationFeePaise,
    statusText: canMarkNoShow
      ? `No-show wait complete (${formatWaitDuration(elapsedWaitSeconds)}) · Passenger no-show cancellation unlocked${compNote}.`
      : `Waiting at pickup ${formatWaitDuration(elapsedWaitSeconds)} · Wait ${formatWaitDuration(remainingWaitSeconds)} more to unlock no-show cancellation${compNote}.`,
  };
}

export interface DriverArrearsWalletEffect {
  totalCollectFromRiderPaise: number;
  cashWalletDebitPaise: number;
  onlineWalletCreditPaise: number;
  summaryNote: string;
}

export function resolveDriverArrearsWalletEffect(params: {
  grossFarePaise: number;
  commissionPaise: number;
  netEarningsPaise: number;
  arrearsPaise: number;
  method: 'CASH' | 'ONLINE_UPI' | 'PENDING';
}): DriverArrearsWalletEffect {
  const arrears = Math.max(0, params.arrearsPaise);
  const totalCollectFromRiderPaise = params.grossFarePaise + arrears;
  const cashWalletDebitPaise = params.commissionPaise + arrears;
  const onlineWalletCreditPaise = params.netEarningsPaise;

  if (arrears === 0) {
    return {
      totalCollectFromRiderPaise,
      cashWalletDebitPaise,
      onlineWalletCreditPaise,
      summaryNote:
        params.method === 'ONLINE_UPI'
          ? `Wallet effect: +${formatInrTwoDecimals(onlineWalletCreditPaise)} net earnings credited via UPI.`
          : `Wallet effect: -${formatInrTwoDecimals(params.commissionPaise)} commission deducted on cash collection.`,
    };
  }

  if (params.method === 'CASH') {
    return {
      totalCollectFromRiderPaise,
      cashWalletDebitPaise,
      onlineWalletCreditPaise,
      summaryNote: `Cash wallet effect: You collect ${formatInrTwoDecimals(totalCollectFromRiderPaise)} cash; -${formatInrTwoDecimals(cashWalletDebitPaise)} (${formatInrTwoDecimals(params.commissionPaise)} commission + ${formatInrTwoDecimals(arrears)} rider arrears) is deducted from your wallet.`,
    };
  }

  if (params.method === 'ONLINE_UPI') {
    return {
      totalCollectFromRiderPaise,
      cashWalletDebitPaise,
      onlineWalletCreditPaise,
      summaryNote: `UPI wallet effect: +${formatInrTwoDecimals(onlineWalletCreditPaise)} net trip earnings credited to your wallet; Cabzone retains commission and ${formatInrTwoDecimals(arrears)} rider arrears.`,
    };
  }

  return {
    totalCollectFromRiderPaise,
    cashWalletDebitPaise,
    onlineWalletCreditPaise,
    summaryNote: `Collect ${formatInrTwoDecimals(totalCollectFromRiderPaise)} total (${formatInrTwoDecimals(params.grossFarePaise)} trip fare + ${formatInrTwoDecimals(arrears)} rider arrears). Commission applies only to trip fare. On cash, ${formatInrTwoDecimals(cashWalletDebitPaise)} is deducted from wallet; on UPI, +${formatInrTwoDecimals(onlineWalletCreditPaise)} net earnings is credited.`,
  };
}

export function extractDriverCancellationCompensationPaise(events: RideEventDto[]): number {
  let compensatedPaise = 0;
  for (const ev of events) {
    if (ev.eventType === 'CANCELLATION_FEE_APPLIED') {
      const comp = (ev.metadata as { driverCompensationPaise?: unknown } | null)
        ?.driverCompensationPaise;
      if (typeof comp === 'number' && Number.isFinite(comp) && comp > 0) {
        compensatedPaise = comp;
      }
    }
    if (ev.eventType === 'CANCELLATION_FEE_WAIVED') {
      const reversed = (ev.metadata as { driverCompensationReversedPaise?: unknown } | null)
        ?.driverCompensationReversedPaise;
      if (typeof reversed === 'number' && Number.isFinite(reversed) && reversed > 0) {
        compensatedPaise = Math.max(0, compensatedPaise - reversed);
      }
    }
  }
  return compensatedPaise;
}
