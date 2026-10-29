import type { AdminRole, RideStatus } from '@cabzone/contracts';
import {
  CANCELLABLE_RIDE_STATUSES,
  type PaymentDisputeEvidenceDto,
  type RideEventDto,
} from '../../../lib/api/endpoints/rides';

export function canAdminViewDisputes(role: AdminRole | null | undefined): boolean {
  return role === 'SUPER_ADMIN' || role === 'SUPPORT_ADMIN' || role === 'FINANCE_ADMIN';
}

export function canAdminResolveDispute(
  role: AdminRole | null | undefined,
  status: RideStatus | null | undefined,
): boolean {
  return (
    status === 'PAYMENT_DISPUTED' && (role === 'SUPER_ADMIN' || role === 'SUPPORT_ADMIN')
  );
}

export function canAdminForceCancelRide(
  role: AdminRole | null | undefined,
  status: RideStatus | null | undefined,
): boolean {
  return (
    status != null &&
    CANCELLABLE_RIDE_STATUSES.includes(status) &&
    (role === 'SUPER_ADMIN' || role === 'CITY_ADMIN' || role === 'SUPPORT_ADMIN')
  );
}

export function canAdminWaiveCancellationFee(
  role: AdminRole | null | undefined,
  status: RideStatus | null | undefined,
): boolean {
  return (
    status === 'CANCELLED' &&
    (role === 'SUPER_ADMIN' || role === 'SUPPORT_ADMIN' || role === 'FINANCE_ADMIN')
  );
}

export function canAdminMutateFinance(role: AdminRole | null | undefined): boolean {
  return role === 'SUPER_ADMIN' || role === 'FINANCE_ADMIN';
}

export type DisputePaymentVerificationState =
  | 'PROVIDER_CONFIRMED'
  | 'CASH_REPORTED'
  | 'PAYMENT_PENDING'
  | 'REFUND_REVIEW_REQUIRED'
  | 'REFUND_RECORDED';

export function deriveDisputePaymentStates(
  evidence: PaymentDisputeEvidenceDto | null | undefined,
  resolution: RideEventDto | null | undefined,
): DisputePaymentVerificationState[] {
  if (!evidence) return [];
  const states: DisputePaymentVerificationState[] = [];

  if (evidence.paymentConfirmedAt) {
    if (evidence.paymentMethod === 'UPI' || evidence.providerPaymentId || evidence.providerQrId) {
      states.push('PROVIDER_CONFIRMED');
    } else {
      states.push('CASH_REPORTED');
    }
  } else {
    states.push('PAYMENT_PENDING');
  }

  if (evidence.providerRefundReference) {
    states.push('REFUND_RECORDED');
  } else if (evidence.requiresManualProviderRefund && !resolution) {
    states.push('REFUND_REVIEW_REQUIRED');
  }

  return states;
}

export function extractChargedCancellationFeePaise(events: readonly RideEventDto[]): {
  chargedPaise: number;
  alreadyWaived: boolean;
  waivedPaise: number;
} {
  let chargedPaise = 0;
  let alreadyWaived = false;
  let waivedPaise = 0;

  for (const ev of events) {
    if (ev.eventType === 'RIDE_CANCELLED' && ev.metadata) {
      const fee = ev.metadata.cancellationFeePaise ?? ev.metadata.feeChargedPaise;
      if (typeof fee === 'number' && Number.isFinite(fee) && fee > 0) {
        chargedPaise = fee;
      }
    }
    if (ev.eventType === 'CANCELLATION_FEE_WAIVED') {
      alreadyWaived = true;
      const waived = ev.metadata?.waivedPaise;
      if (typeof waived === 'number' && Number.isFinite(waived) && waived > 0) {
        waivedPaise = waived;
      }
    }
  }

  return { chargedPaise, alreadyWaived, waivedPaise };
}
