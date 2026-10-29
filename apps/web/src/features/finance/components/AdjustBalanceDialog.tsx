'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import type { WalletSummaryDto } from '@cabzone/contracts';
import { Button, Dialog, Input } from '@cabzone/design-system';
import { formatPaise } from '@/lib/format';
import { useAdjustWallet } from '../hooks/useFinance';

function nextIdempotencyKey(): string | undefined {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : undefined;
}

export interface AdjustBalanceDialogProps {
  wallet: WalletSummaryDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AdjustBalanceDialog({
  wallet,
  open,
  onOpenChange,
  onSuccess,
}: AdjustBalanceDialogProps) {
  const amountId = useId();
  const reasonId = useId();
  const [type, setType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [rupees, setRupees] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const attemptKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    attemptKeyRef.current = undefined;
  }, [wallet?.id, wallet?.ownerId, type, rupees, reason, open]);

  const adjustMutation = useAdjustWallet(() => {
    attemptKeyRef.current = undefined;
    setRupees('');
    setReason('');
    setError(null);
    onOpenChange(false);
    onSuccess?.();
  });

  if (!wallet) return null;

  const isCustomer = wallet.ownerType === 'RIDER';
  const amountPaise = Math.round(Number(rupees) * 100);
  const isValidAmount = Number.isFinite(amountPaise) && amountPaise > 0;
  const isValidReason = reason.trim().length >= 5;
  const isDebitOverdraw =
    type === 'DEBIT' && isValidAmount && amountPaise > wallet.balancePaise;

  const canSubmit = isValidAmount && isValidReason && !isDebitOverdraw && !adjustMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submittingRef.current) return;
    submittingRef.current = true;
    setError(null);

    if (!attemptKeyRef.current) {
      attemptKeyRef.current = nextIdempotencyKey();
    }

    const payload = {
      ...(isCustomer ? { riderId: wallet.ownerId } : { driverId: wallet.ownerId }),
      walletId: wallet.id.startsWith('virtual-') ? undefined : wallet.id,
      type,
      amountPaise,
      reason: reason.trim(),
      idempotencyKey: attemptKeyRef.current,
    };

    adjustMutation.mutate(payload, {
      onError: (err) => {
        setError(err instanceof Error ? err.message : 'Failed to adjust balance.');
      },
      onSettled: () => {
        submittingRef.current = false;
      },
    });
  };

  const newBalancePaise =
    type === 'CREDIT'
      ? wallet.balancePaise + (isValidAmount ? amountPaise : 0)
      : wallet.balancePaise - (isValidAmount ? amountPaise : 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!adjustMutation.isPending && !submittingRef.current) {
          setError(null);
          onOpenChange(val);
        }
      }}
      title={isCustomer ? 'Adjust Rider Balance' : 'Adjust Driver Balance'}
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 py-1">
        {/* User Summary Card */}
        <div className="flex items-center justify-between p-3.5 bg-surface-sunken border border-border rounded-lg text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-text text-sm">
              {wallet.name || (isCustomer ? 'Unnamed Customer' : 'Driver')}
            </span>
            <span className="font-mono text-text-subtle">{wallet.phoneE164}</span>
            {wallet.vehicleNumber && (
              <span className="text-[11px] text-text-subtle font-mono mt-0.5">
                {wallet.vehicleNumber} {wallet.zoneName ? `• ${wallet.zoneName}` : ''}
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-text-subtle text-[11px]">Current Balance</span>
            <span
              className={`font-semibold text-sm ${
                wallet.balancePaise > 0
                  ? 'text-success'
                  : wallet.balancePaise < 0
                    ? 'text-danger'
                    : 'text-text'
              }`}
            >
              {formatPaise(wallet.balancePaise)}
            </span>
            {wallet.owedAmountPaise > 0 && (
              <span className="text-[11px] text-danger font-medium">
                Owed: {formatPaise(wallet.owedAmountPaise)}
              </span>
            )}
          </div>
        </div>

        {/* Action Type */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-text">Adjustment Action</span>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Adjustment Action">
            <button
              type="button"
              aria-pressed={type === 'CREDIT'}
              onClick={() => setType('CREDIT')}
              className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-all ${
                type === 'CREDIT'
                  ? 'border-success bg-success/10 text-success font-semibold shadow-xs'
                  : 'border-border bg-surface text-text-subtle hover:text-text'
              }`}
            >
              <ArrowDownLeft className="size-4" />
              <span>Credit (Add Float)</span>
            </button>
            <button
              type="button"
              aria-pressed={type === 'DEBIT'}
              onClick={() => setType('DEBIT')}
              className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-all ${
                type === 'DEBIT'
                  ? 'border-danger bg-danger/10 text-danger font-semibold shadow-xs'
                  : 'border-border bg-surface text-text-subtle hover:text-text'
              }`}
            >
              <ArrowUpRight className="size-4" />
              <span>Debit (Deduct Float)</span>
            </button>
          </div>
        </div>

        {/* Amount Input */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={amountId} className="text-xs font-semibold text-text">
            Amount (₹)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle font-medium">
              ₹
            </span>
            <Input
              id={amountId}
              type="number"
              min="1"
              step="any"
              value={rupees}
              onChange={(e) => setRupees(e.target.value)}
              placeholder="e.g. 500"
              className="pl-8 font-mono font-medium text-sm h-10"
              autoFocus
            />
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex items-center gap-1.5 pt-1">
            <span className="text-[11px] text-text-subtle">Presets:</span>
            {[100, 200, 500, 1000].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setRupees(String(preset))}
                className="px-2 py-0.5 text-[11px] font-mono rounded bg-surface-muted border border-border hover:bg-surface-sunken text-text cursor-pointer transition-colors"
              >
                +₹{preset}
              </button>
            ))}
          </div>
        </div>

        {/* Reason / Audit Note */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={reasonId} className="text-xs font-semibold text-text">
            Audit Reason (Recorded in ledger)
          </label>
          <Input
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              isCustomer
                ? 'e.g. Dispute refund waiver or compensation credit'
                : 'e.g. Cash top-up received at office / Settlement correction'
            }
            maxLength={255}
            className="text-sm h-10"
          />
          <span className="text-[11px] text-text-subtle">
            Minimum 5 characters required for compliance audit trails.
          </span>
        </div>

        {/* Balance Preview */}
        {isValidAmount && (
          <div className="p-3 bg-surface-muted border border-border rounded-lg flex items-center justify-between text-xs">
            <span className="text-text-subtle">Resulting Balance:</span>
            <div className="flex items-center gap-1.5 font-semibold font-mono text-sm">
              <span className="text-text-subtle line-through">
                {formatPaise(wallet.balancePaise)}
              </span>
              <span>→</span>
              <span className={newBalancePaise >= 0 ? 'text-success' : 'text-danger'}>
                {formatPaise(newBalancePaise)}
              </span>
            </div>
          </div>
        )}

        {/* Overdraw Warning */}
        {isDebitOverdraw && (
          <p
            role="alert"
            className="text-xs text-danger font-medium bg-danger/10 p-2.5 rounded border border-danger/20"
          >
            Cannot debit ₹{rupees}: would exceed current balance of{' '}
            {formatPaise(wallet.balancePaise)}.
          </p>
        )}

        {/* Server Error */}
        {error && (
          <p
            role="alert"
            className="text-xs text-danger font-medium bg-danger/10 p-2.5 rounded border border-danger/20"
          >
            {error}
          </p>
        )}

        {/* Form Actions */}
        <div className="flex justify-end gap-2.5 pt-3 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={adjustMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={adjustMutation.isPending}
            disabled={!canSubmit}
            icon={<CheckCircle2 className="size-4" />}
          >
            {type === 'CREDIT' ? 'Confirm Credit' : 'Confirm Debit'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
