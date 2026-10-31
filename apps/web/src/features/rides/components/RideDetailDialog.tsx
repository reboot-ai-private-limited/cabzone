'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type AdminRole,
  CANCELLATION_REASONS,
  type CancellationReason,
} from '@cabzone/contracts';
import {
  Badge,
  Button,
  DefinitionList,
  Dialog,
  FieldRow,
  Input,
  Select,
  Skeleton,
} from '@cabzone/design-system';
import { getStoredAdminRole } from '@/features/auth/lib/authApi';
import {
  type AdminRideDto,
  type PaymentDisputeQueueItemDto,
  type RideEventDto,
  ridesApi,
} from '@/lib/api/endpoints/rides';
import { formatPaise } from '@/lib/format';
import { keys } from '@/lib/query/keys';
import { useRideEvents } from '../hooks/useRides';
import {
  canAdminForceCancelRide,
  canAdminResolveDispute,
  canAdminWaiveCancellationFee,
  deriveDisputePaymentStates,
  extractChargedCancellationFeePaise,
} from '../lib/adminRidePermissions';
import { RideStatusBadge } from './RideStatusBadge';

const fmt = (iso: string | null): string =>
  iso === null
    ? '—'
    : new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

const place = (p: { lat: number; lng: number; address: string | null }): string =>
  p.address ?? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;

const CANCEL_OPTIONS = CANCELLATION_REASONS.map((r) => ({
  value: r,
  label: r.replaceAll('_', ' '),
}));

const CASH_DISPUTE_OUTCOME_OPTIONS = [
  { value: 'RIDER_WINS', label: 'Rider wins — refund charged commission to driver' },
  { value: 'DRIVER_WINS', label: 'Driver wins — uphold settlement' },
];

const ONLINE_DISPUTE_OUTCOME_OPTIONS = [
  {
    value: 'RIDER_WINS',
    label: 'Rider wins — record Razorpay refund & reverse online earnings',
  },
  { value: 'DRIVER_WINS', label: 'Driver wins — uphold online settlement' },
];

function summarizeMetadata(e: RideEventDto): string | null {
  const m = e.metadata;
  if (!m) return null;
  const parts: string[] = [];
  if (typeof m.outcome === 'string') parts.push(`Outcome: ${m.outcome}`);
  if (typeof m.reason === 'string' && m.reason.trim()) parts.push(`Reason: ${m.reason}`);
  if (typeof m.method === 'string') parts.push(`Method: ${m.method}`);
  if (typeof m.paymentId === 'string') parts.push(`Payment: ${m.paymentId}`);
  if (typeof m.refundReference === 'string') parts.push(`Refund Ref: ${m.refundReference}`);
  if (typeof m.refundedCommissionPaise === 'number' && m.refundedCommissionPaise > 0) {
    parts.push(`Refunded commission: ${formatPaise(m.refundedCommissionPaise)}`);
  }
  if (typeof m.reversedOnlineEarningsPaise === 'number' && m.reversedOnlineEarningsPaise > 0) {
    parts.push(`Reversed online earnings: ${formatPaise(m.reversedOnlineEarningsPaise)}`);
  }
  if (typeof m.waivedPaise === 'number' && m.waivedPaise > 0) {
    parts.push(`Waived fee: ${formatPaise(m.waivedPaise)}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function RideDetailDialog({
  ride,
  dispute = null,
  adminRole: adminRoleProp,
  onRideUpdated,
  onOpenChange,
}: {
  ride: AdminRideDto | null;
  dispute?: PaymentDisputeQueueItemDto | null;
  adminRole?: AdminRole | null;
  onRideUpdated?: (ride: AdminRideDto) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const events = useRideEvents(ride?.id ?? null);
  const [resolvedRole, setResolvedRole] = useState<AdminRole | null>(adminRoleProp ?? null);
  const [outcome, setOutcome] = useState<'RIDER_WINS' | 'DRIVER_WINS'>('RIDER_WINS');
  const [disputeReason, setDisputeReason] = useState('');
  const [refundReference, setRefundReference] = useState('');
  const [waiveReason, setWaiveReason] = useState('');
  const [waiveSuccessMessage, setWaiveSuccessMessage] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<CancellationReason>('ADMIN_OVERRIDE');
  const [actionError, setActionError] = useState<string | null>(null);
  const actionInFlightRef = useRef(false);

  useEffect(() => {
    setResolvedRole(adminRoleProp ?? getStoredAdminRole());
  }, [adminRoleProp]);

  useEffect(() => {
    setActionError(null);
    setDisputeReason('');
    setRefundReference('');
    setWaiveReason('');
    setWaiveSuccessMessage(null);
    setOutcome('RIDER_WINS');
    setCancelReason('ADMIN_OVERRIDE');
    actionInFlightRef.current = false;
  }, [ride?.id]);

  const evidence = dispute?.evidence;
  const eventList = events.data ?? [];
  const confirmedFromEvents = eventList.find((e) => e.eventType === 'PAYMENT_CONFIRMED');
  const disputeFromEvents = [...eventList].reverse().find((e) => e.eventType === 'PAYMENT_DISPUTED');
  const requiresManualProviderRefund =
    evidence?.requiresManualProviderRefund ??
    Boolean(
      confirmedFromEvents?.metadata?.method === 'UPI' ||
        (confirmedFromEvents &&
          confirmedFromEvents.metadata?.method !== 'UPI' &&
          typeof disputeFromEvents?.metadata?.paymentId === 'string') ||
        ride?.paymentCollection === 'RAZORPAY_UPI' ||
        ride?.paymentCollection === 'RAZORPAY_TEST',
    );
  const needsRefundReference = requiresManualProviderRefund && outcome === 'RIDER_WINS';

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!ride) throw new Error('No ride selected');
      return ridesApi.resolvePaymentDispute(ride.id, outcome, disputeReason.trim(), {
        ...(needsRefundReference ? { refundReference: refundReference.trim() } : {}),
      });
    },
    onSuccess: (updated) => {
      setActionError(null);
      setDisputeReason('');
      setRefundReference('');
      void queryClient.invalidateQueries({ queryKey: keys.rides.all() });
      void queryClient.invalidateQueries({ queryKey: keys.wallets.all() });
      onRideUpdated?.(updated);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Could not resolve dispute.');
    },
    onSettled: () => {
      actionInFlightRef.current = false;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!ride) throw new Error('No ride selected');
      return ridesApi.cancel(ride.id, cancelReason);
    },
    onSuccess: (res) => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: keys.rides.all() });
      onRideUpdated?.(res.ride);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Could not cancel ride.');
    },
    onSettled: () => {
      actionInFlightRef.current = false;
    },
  });

  const waiveMutation = useMutation({
    mutationFn: async () => {
      if (!ride) throw new Error('No ride selected');
      return ridesApi.waiveCancellationFee(ride.id, waiveReason.trim());
    },
    onSuccess: (res) => {
      setActionError(null);
      setWaiveReason('');
      setWaiveSuccessMessage(`Waived ${formatPaise(res.waivedPaise)} cancellation fee.`);
      void queryClient.invalidateQueries({ queryKey: keys.rides.all() });
      void queryClient.invalidateQueries({ queryKey: keys.wallets.all() });
      if (ride) void queryClient.invalidateQueries({ queryKey: keys.rides.events(ride.id) });
      onRideUpdated?.(res.ride);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : 'Could not waive cancellation fee.');
    },
    onSettled: () => {
      actionInFlightRef.current = false;
    },
  });

  const canResolveDispute = canAdminResolveDispute(resolvedRole, ride?.status);
  const canForceCancel = canAdminForceCancelRide(resolvedRole, ride?.status);
  const canWaiveFee = canAdminWaiveCancellationFee(resolvedRole, ride?.status);

  const cancellationFeeMeta = extractChargedCancellationFeePaise(eventList);
  const disputePaymentStates = deriveDisputePaymentStates(evidence, dispute?.resolution);
  const settlement = ride?.driverSettlement;

  return (
    <Dialog
      open={ride !== null}
      onOpenChange={onOpenChange}
      title={ride === null ? '' : `Ride ${ride.id.slice(0, 8)}`}
      description={ride === null ? undefined : `Requested ${fmt(ride.createdAt)}`}
      className="max-w-2xl"
    >
      {ride !== null && (
        <div className="flex flex-col gap-5 max-h-[75vh] overflow-y-auto pr-1">
          <DefinitionList>
            <FieldRow label="Status">
              <RideStatusBadge status={ride.status} />
            </FieldRow>
            <FieldRow label="Passenger">
              {ride.passenger.name}
            </FieldRow>
            <FieldRow label="Driver">
              {ride.driverId === null ? (
                <span className="text-text-subtle">Not assigned</span>
              ) : (
                <span className="font-mono">{ride.driverId.slice(0, 8)}</span>
              )}
            </FieldRow>
            <FieldRow label="Vehicle">{ride.vehicleCategory}</FieldRow>
            <FieldRow label="Pickup">{place(ride.pickup)}</FieldRow>
            <FieldRow label="Drop">{place(ride.drop)}</FieldRow>
            <FieldRow label="Trip">
              {(ride.routeSnapshot.distanceM / 1000).toFixed(1)} km ·{' '}
              {Math.round(ride.routeSnapshot.durationSeconds / 60)} min ·{' '}
              {ride.zoneSnapshot.classification}
            </FieldRow>
            <FieldRow label="Suggested fare">{formatPaise(ride.suggestedFarePaise)}</FieldRow>
            <FieldRow label="Proposed fare">
              {ride.proposedFarePaise === null ? '—' : formatPaise(ride.proposedFarePaise)}
            </FieldRow>
            <FieldRow label="Agreed fare">
              {ride.agreedFarePaise === null ? '—' : formatPaise(ride.agreedFarePaise)}
            </FieldRow>
            {(ride.arrearsPaise ?? 0) > 0 && (
              <FieldRow label="Attached arrears">
                <span className="font-mono text-xs text-warning">
                  {formatPaise(ride.arrearsPaise ?? 0)}
                  {ride.totalPayablePaise !== undefined
                    ? ` (Total payable ${formatPaise(ride.totalPayablePaise)})`
                    : ''}
                </span>
              </FieldRow>
            )}
            {(ride.paymentCollection || evidence?.paymentCollection) && (
              <FieldRow label="Payment collection">
                <span className="font-mono text-xs">
                  {ride.paymentCollection ?? evidence?.paymentCollection}
                </span>
              </FieldRow>
            )}
            {settlement && (
              <FieldRow label="Driver settlement">
                <span className="text-xs font-mono">
                  Net {formatPaise(settlement.netEarningsPaise)} · Fee{' '}
                  {formatPaise(settlement.netCommissionPaise)}
                  {settlement.commissionRefundedPaise > 0
                    ? ` (Refunded ${formatPaise(settlement.commissionRefundedPaise)})`
                    : ''}
                  {(settlement.onlineEarningsReversedPaise ?? 0) > 0
                    ? ` (Online earnings reversed ${formatPaise(settlement.onlineEarningsReversedPaise ?? 0)})`
                    : ''}
                </span>
              </FieldRow>
            )}
            {ride.cancellationReason !== null && (
              <FieldRow label="Reason">
                <Badge tone="danger">{ride.cancellationReason}</Badge>
              </FieldRow>
            )}
          </DefinitionList>

          {dispute && (
            <section
              aria-label="Dispute Evidence"
              className="rounded-lg border border-border bg-surface-muted/50 p-3.5 flex flex-col gap-2 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="font-semibold uppercase tracking-wider text-text">
                    Dispute &amp; Receipt Evidence
                  </h3>
                  {dispute.evidence.isDuplicateUpiAfterCash && (
                    <Badge tone="warning">DUPLICATE UPI AFTER CASH</Badge>
                  )}
                  {disputePaymentStates.includes('PROVIDER_CONFIRMED') && (
                    <Badge tone="info">PROVIDER CONFIRMED</Badge>
                  )}
                  {disputePaymentStates.includes('CASH_REPORTED') && (
                    <Badge tone="neutral">CASH REPORTED</Badge>
                  )}
                  {disputePaymentStates.includes('PAYMENT_PENDING') && (
                    <Badge tone="warning">PAYMENT PENDING</Badge>
                  )}
                  {disputePaymentStates.includes('REFUND_REVIEW_REQUIRED') && (
                    <Badge tone="warning">REFUND REVIEW REQUIRED</Badge>
                  )}
                  {disputePaymentStates.includes('REFUND_RECORDED') && (
                    <Badge tone="info">REFUND RECORDED</Badge>
                  )}
                </div>
                {dispute.resolution ? (
                  <Badge tone="success">RESOLVED</Badge>
                ) : (
                  <Badge tone="warning">OPEN DISPUTE</Badge>
                )}
              </div>
              <p className="text-text">
                <span className="font-semibold">Rider complaint:</span>{' '}
                {typeof dispute.ticket?.metadata?.reason === 'string'
                  ? dispute.ticket.metadata.reason
                  : '—'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-text-subtle pt-1">
                <span>Receipt Ref: {dispute.evidence.receiptReference ?? '—'}</span>
                <span>
                  Confirmed At:{' '}
                  {dispute.evidence.paymentConfirmedAt
                    ? fmt(dispute.evidence.paymentConfirmedAt)
                    : '—'}
                </span>
                <span>Order ID: {dispute.evidence.providerOrderId ?? '—'}</span>
                <span>Payment ID: {dispute.evidence.providerPaymentId ?? '—'}</span>
                {dispute.evidence.providerQrId && (
                  <span>QR ID: {dispute.evidence.providerQrId}</span>
                )}
                {dispute.evidence.providerRefundReference && (
                  <span className="text-info">
                    Razorpay Refund Ref: {dispute.evidence.providerRefundReference}
                  </span>
                )}
                <span>
                  Commission charged: {formatPaise(dispute.evidence.commissionChargedPaise)}
                </span>
                <span>
                  Commission refunded: {formatPaise(dispute.evidence.commissionRefundedPaise)}
                </span>
                {dispute.evidence.onlineEarningsCreditedPaise > 0 && (
                  <span>
                    Online earnings credited:{' '}
                    {formatPaise(dispute.evidence.onlineEarningsCreditedPaise)}
                  </span>
                )}
                {(dispute.evidence.onlineEarningsReversedPaise ?? 0) > 0 && (
                  <span className="text-warning">
                    Online earnings reversed:{' '}
                    {formatPaise(dispute.evidence.onlineEarningsReversedPaise ?? 0)}
                  </span>
                )}
                {dispute.evidence.refundTransactionId && (
                  <span className="sm:col-span-2">
                    Refund Ledger Tx: {dispute.evidence.refundTransactionId}
                  </span>
                )}
                {dispute.evidence.reversalTransactionId && (
                  <span className="sm:col-span-2">
                    Reversal Ledger Tx: {dispute.evidence.reversalTransactionId}
                  </span>
                )}
              </div>
              {dispute.resolution && (
                <p className="text-text pt-1 border-t border-border">
                  <span className="font-semibold">Admin ruling:</span>{' '}
                  {String(dispute.resolution.metadata?.outcome ?? '')} —{' '}
                  {String(dispute.resolution.metadata?.reason ?? '')}
                </p>
              )}
            </section>
          )}

          {actionError && (
            <p role="alert" className="text-xs font-medium text-danger">
              {actionError}
            </p>
          )}

          {waiveSuccessMessage && (
            <p role="status" className="text-xs font-medium text-success">
              {waiveSuccessMessage}
            </p>
          )}

          {canResolveDispute && (
            <section
              aria-label="Resolve Payment Dispute"
              className="rounded-lg border border-border bg-surface p-3.5 flex flex-col gap-3"
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text">
                Resolve Payment Dispute
              </h3>
              <Select
                value={outcome}
                onValueChange={(v) => setOutcome(v as 'RIDER_WINS' | 'DRIVER_WINS')}
                options={
                  requiresManualProviderRefund
                    ? ONLINE_DISPUTE_OUTCOME_OPTIONS
                    : CASH_DISPUTE_OUTCOME_OPTIONS
                }
              />
              {needsRefundReference && (
                <div className="flex flex-col gap-1">
                  <Input
                    type="text"
                    value={refundReference}
                    onChange={(e) => setRefundReference(e.target.value)}
                    placeholder="Manual Razorpay refund ID (e.g. rfnd_...)..."
                  />
                  <span className="text-[11px] text-text-subtle">
                    Issue the customer refund in Razorpay Dashboard first, then enter its refund
                    reference to reconcile the ledger once.
                  </span>
                </div>
              )}
              <Input
                type="text"
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="Resolution audit note (minimum 10 characters)..."
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  loading={resolveMutation.isPending}
                  disabled={
                    resolveMutation.isPending ||
                    disputeReason.trim().length < 10 ||
                    (needsRefundReference && refundReference.trim().length < 4)
                  }
                  onClick={() => {
                    if (actionInFlightRef.current || resolveMutation.isPending) return;
                    actionInFlightRef.current = true;
                    resolveMutation.mutate();
                  }}
                >
                  Submit Ruling
                </Button>
              </div>
            </section>
          )}

          {canWaiveFee && (
            <section
              aria-label="Cancellation Fee Waiver"
              className="rounded-lg border border-border bg-surface p-3.5 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text">
                  Cancellation Fee Waiver
                </h3>
                {cancellationFeeMeta.alreadyWaived ? (
                  <Badge tone="success">
                    WAIVED
                    {cancellationFeeMeta.waivedPaise > 0
                      ? ` (${formatPaise(cancellationFeeMeta.waivedPaise)})`
                      : ''}
                  </Badge>
                ) : cancellationFeeMeta.chargedPaise > 0 ? (
                  <Badge tone="warning">
                    CHARGED {formatPaise(cancellationFeeMeta.chargedPaise)}
                  </Badge>
                ) : null}
              </div>
              {cancellationFeeMeta.alreadyWaived ? (
                <p className="text-xs text-text-subtle">
                  The cancellation fee for this ride has already been waived and reconciled in the
                  rider wallet ledger.
                </p>
              ) : (
                <>
                  <Input
                    type="text"
                    value={waiveReason}
                    onChange={(e) => setWaiveReason(e.target.value)}
                    placeholder="Reason for waiving cancellation fee (minimum 5 characters)..."
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={waiveMutation.isPending}
                      disabled={waiveMutation.isPending || waiveReason.trim().length < 5}
                      onClick={() => {
                        if (actionInFlightRef.current || waiveMutation.isPending) return;
                        actionInFlightRef.current = true;
                        waiveMutation.mutate();
                      }}
                    >
                      Waive Cancellation Fee
                    </Button>
                  </div>
                </>
              )}
            </section>
          )}

          {canForceCancel && (
            <section
              aria-label="Force Cancel Ride"
              className="rounded-lg border border-border bg-surface p-3.5 flex flex-col gap-3"
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text">
                Operator Force Cancel
              </h3>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div className="flex-1">
                  <Select
                    value={cancelReason}
                    onValueChange={(v) => setCancelReason(v as CancellationReason)}
                    options={CANCEL_OPTIONS}
                  />
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  loading={cancelMutation.isPending}
                  disabled={cancelMutation.isPending}
                  onClick={() => {
                    if (actionInFlightRef.current || cancelMutation.isPending) return;
                    actionInFlightRef.current = true;
                    cancelMutation.mutate();
                  }}
                >
                  Force Cancel Ride
                </Button>
              </div>
            </section>
          )}

          <section aria-label="Timeline" className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-subtle">
              Timeline
            </h3>
            {events.isLoading ? (
              <Skeleton className="h-16 rounded-md" />
            ) : events.isError ? (
              <p className="text-sm text-danger">Could not load the timeline.</p>
            ) : (events.data ?? []).length === 0 ? (
              <p className="text-sm text-text-subtle">No recorded events yet.</p>
            ) : (
              <ol className="flex flex-col divide-y divide-border">
                {(events.data ?? []).map((e) => {
                  const summary = summarizeMetadata(e);
                  return (
                    <li key={e.id} className="flex flex-col gap-0.5 py-2 text-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-medium text-text">
                          {e.eventType.replaceAll('_', ' ')}
                        </span>
                        <span className="text-xs text-text-subtle">
                          {e.actorType} · {fmt(e.createdAt)}
                        </span>
                      </div>
                      {summary && (
                        <span className="text-xs text-text-subtle font-mono">{summary}</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}
