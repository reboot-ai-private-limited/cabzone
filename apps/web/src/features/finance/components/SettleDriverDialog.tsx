'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { WalletSummaryDto } from '@cabzone/contracts';
import { Button, Dialog, Input } from '@cabzone/design-system';
import { formatPaise } from '@/lib/format';
import { useAdjustWallet } from '../hooks/useFinance';

function nextIdempotencyKey(): string | undefined {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : undefined;
}

export interface SettleDriverDialogProps {
  wallet: WalletSummaryDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function SettleDriverDialog({
  wallet,
  open,
  onOpenChange,
  onSuccess,
}: SettleDriverDialogProps) {
  const amountId = useId();
  const noteId = useId();
  const [method, setMethod] = useState<'UPI' | 'CASH' | 'WAIVER'>('UPI');
  const [rupees, setRupees] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const attemptKeyRef = useRef<string | undefined>(undefined);

  // Initialize pre-filled amount when dialog opens or wallet changes
  useEffect(() => {
    if (wallet) {
      if ((wallet.owedToCompanyPaise ?? 0) > 0) {
        setRupees(((wallet.owedToCompanyPaise ?? 0) / 100).toFixed(0));
      } else if ((wallet.payableToDriverPaise ?? 0) > 0) {
        setRupees(((wallet.payableToDriverPaise ?? 0) / 100).toFixed(0));
      } else {
        setRupees('0');
      }
      setNote('');
      setError(null);
      attemptKeyRef.current = undefined;
    }
  }, [wallet, open]);

  useEffect(() => {
    attemptKeyRef.current = undefined;
  }, [method, rupees, note]);

  const adjustMutation = useAdjustWallet(() => {
    attemptKeyRef.current = undefined;
    setRupees('');
    setNote('');
    setError(null);
    onOpenChange(false);
    onSuccess?.();
  });

  if (!wallet) return null;

  const owedAmount = wallet.owedToCompanyPaise ?? 0;
  const payableAmount = wallet.payableToDriverPaise ?? 0;
  const isOwing = owedAmount > 0;
  const isPayable = payableAmount > 0;

  const parsedPaise = Math.round(Number(rupees) * 100);
  const isValidAmount = Number.isFinite(parsedPaise) && parsedPaise > 0;
  const isValidNote = note.trim().length >= 5;
  const canSubmit = isValidAmount && isValidNote && !adjustMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submittingRef.current) return;
    submittingRef.current = true;
    setError(null);

    if (!attemptKeyRef.current) {
      attemptKeyRef.current = nextIdempotencyKey();
    }

    // If driver owes company, settling arrears means CREDITING driver's wallet to bring balance up to 0 (or positive).
    // If company owes driver, payout means DEBITING driver's wallet as paid out to driver.
    const type = isOwing ? 'CREDIT' : isPayable ? 'DEBIT' : 'CREDIT';
    const reasonText = `Settlement (${method}): ${note.trim()}`;

    adjustMutation.mutate(
      {
        driverId: wallet.ownerId,
        walletId: wallet.id.startsWith('virtual-') ? undefined : wallet.id,
        type,
        amountPaise: parsedPaise,
        reason: reasonText,
        idempotencyKey: attemptKeyRef.current,
      },
      {
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Failed to process settlement.');
        },
        onSettled: () => {
          submittingRef.current = false;
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!adjustMutation.isPending && !submittingRef.current) {
          setError(null);
          onOpenChange(val);
        }
      }}
      title="Settle Driver Balance"
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 py-1">
        {/* Driver Profile Header */}
        <div className="flex items-center justify-between p-3.5 bg-surface-sunken border border-border rounded-lg text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-text text-sm">{wallet.name || 'Driver'}</span>
            <span className="font-mono text-text-subtle">{wallet.phoneE164}</span>
            {wallet.vehicleNumber && (
              <span className="text-[11px] text-text-subtle font-mono mt-0.5">
                {wallet.vehicleNumber} {wallet.zoneName ? `• ${wallet.zoneName}` : ''}
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            {isOwing ? (
              <div className="flex flex-col items-end">
                <span className="text-[11px] text-red-600 font-medium">Owed to company</span>
                <span className="font-bold text-red-600 text-base">{formatPaise(owedAmount)}</span>
              </div>
            ) : isPayable ? (
              <div className="flex flex-col items-end">
                <span className="text-[11px] text-emerald-600 font-medium">Payable to driver</span>
                <span className="font-bold text-emerald-600 text-base">
                  {formatPaise(payableAmount)}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-end">
                <span className="text-[11px] text-text-subtle font-medium">Current Balance</span>
                <span className="font-bold text-text text-base">₹0</span>
              </div>
            )}
          </div>
        </div>

        {/* Settlement Type & Guidance */}
        <div className="p-3 rounded-lg border text-xs bg-slate-50 border-slate-200 text-slate-700">
          {isOwing ? (
            <p>
              Driver has pending arrears of{' '}
              <span className="font-semibold text-red-600">{formatPaise(owedAmount)}</span>.
              Recording this settlement credits their balance and clears negative limits.
            </p>
          ) : isPayable ? (
            <p>
              Company owes driver{' '}
              <span className="font-semibold text-emerald-600">{formatPaise(payableAmount)}</span>.
              Recording this settlement logs a payout debit to the driver.
            </p>
          ) : (
            <p>Driver has a zero balance. You can record a manual advance float deposit.</p>
          )}
        </div>

        {/* Method Selection */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-text">Settlement Mode</span>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Settlement Mode">
            <button
              type="button"
              aria-pressed={method === 'UPI'}
              onClick={() => setMethod('UPI')}
              className={`py-2 px-3 text-xs font-medium rounded-lg border text-center transition-all cursor-pointer ${
                method === 'UPI'
                  ? 'bg-interactive text-interactive-foreground border-interactive shadow-xs'
                  : 'bg-surface border-border text-text hover:bg-surface-sunken'
              }`}
            >
              UPI / Bank
            </button>
            <button
              type="button"
              aria-pressed={method === 'CASH'}
              onClick={() => setMethod('CASH')}
              className={`py-2 px-3 text-xs font-medium rounded-lg border text-center transition-all cursor-pointer ${
                method === 'CASH'
                  ? 'bg-interactive text-interactive-foreground border-interactive shadow-xs'
                  : 'bg-surface border-border text-text hover:bg-surface-sunken'
              }`}
            >
              Cash Collected
            </button>
            <button
              type="button"
              aria-pressed={method === 'WAIVER'}
              onClick={() => setMethod('WAIVER')}
              className={`py-2 px-3 text-xs font-medium rounded-lg border text-center transition-all cursor-pointer ${
                method === 'WAIVER'
                  ? 'bg-interactive text-interactive-foreground border-interactive shadow-xs'
                  : 'bg-surface border-border text-text hover:bg-surface-sunken'
              }`}
            >
              Fee Waiver
            </button>
          </div>
        </div>

        {/* Settlement Amount */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={amountId} className="text-xs font-semibold text-text">
            Settlement Amount (₹)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle font-semibold text-sm">
              ₹
            </span>
            <Input
              id={amountId}
              type="number"
              min="1"
              step="any"
              value={rupees}
              onChange={(e) => setRupees(e.target.value)}
              placeholder="e.g. 275"
              className="pl-8 font-mono text-sm h-10 w-full"
              required
            />
          </div>
        </div>

        {/* Reference / Note */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={noteId} className="text-xs font-semibold text-text">
            Reference / UTR / Audit Note
          </label>
          <Input
            id={noteId}
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. UPI Ref #493019823 or Office Cash Receipt"
            minLength={5}
            maxLength={240}
            required
            className="text-sm h-10 w-full"
          />
          <span className="text-[11px] text-text-subtle">
            Minimum 5 characters required for settlement audit trail.
          </span>
        </div>

        {/* Error Feedback */}
        {error && (
          <div
            role="alert"
            className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-xs text-danger"
          >
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={adjustMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!canSubmit}
            loading={adjustMutation.isPending}
            icon={<CheckCircle2 className="size-4" />}
          >
            Confirm Settlement
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
