'use client';

import { Clock } from 'lucide-react';
import type { WalletSummaryDto } from '@cabzone/contracts';
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Skeleton,
} from '@cabzone/design-system';
import { formatPaise } from '@/lib/format';
import { useWalletDetail } from '../hooks/useFinance';

export interface WalletAuditModalProps {
  wallet: WalletSummaryDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdjustClick?: () => void;
}

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function WalletAuditModal({
  wallet,
  open,
  onOpenChange,
  onAdjustClick,
}: WalletAuditModalProps) {
  const query = useWalletDetail(open && wallet ? wallet.ownerId : null);
  const transactions = query.data?.transactions ?? [];

  if (!wallet) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Wallet Ledger & Audit Trail"
      className="max-w-3xl"
    >
      <div className="flex flex-col gap-5 py-1">
        {/* User Card */}
        <div className="flex flex-wrap items-center justify-between p-4 bg-surface-sunken border border-border rounded-lg gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text text-base">
                {wallet.name || (wallet.ownerType === 'RIDER' ? 'Unnamed Customer' : 'Driver')}
              </span>
              <Badge tone={wallet.ownerType === 'DRIVER' ? 'neutral' : 'info'}>
                {wallet.ownerType === 'DRIVER' ? 'Driver' : 'Customer'}
              </Badge>
            </div>
            <span className="font-mono text-xs text-text-subtle">ID: {wallet.ownerId.slice(0, 8)}</span>
            {wallet.vehicleNumber && (
              <span className="text-xs text-text-subtle font-mono">
                Vehicle: {wallet.vehicleNumber} {wallet.zoneName ? `• Zone: ${wallet.zoneName}` : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-xs text-text-subtle">Current Float Balance</span>
              <span
                className={`font-semibold font-mono text-base ${
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
                <span className="text-xs font-semibold text-danger">
                  Unpaid Fee: {formatPaise(wallet.owedAmountPaise)}
                </span>
              )}
            </div>

            {onAdjustClick && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onAdjustClick();
                }}
              >
                Adjust
              </Button>
            )}
          </div>
        </div>

        {/* Transactions Table */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-subtle">
              Ledger Entries ({transactions.length})
            </h4>
            <span className="text-[11px] text-text-subtle flex items-center gap-1">
              <Clock className="size-3" />
              Chronological Double-Entry Log
            </span>
          </div>

          {query.isLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full rounded" />
              <Skeleton className="h-10 w-full rounded" />
              <Skeleton className="h-10 w-full rounded" />
            </div>
          ) : transactions.length === 0 ? (
            <EmptyState
              title="No transactions yet"
              description="No debit or credit entries recorded on this wallet ledger."
            />
          ) : (
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-surface-muted/60 border-b border-border text-text-subtle text-[11px] font-semibold uppercase">
                    <th className="py-2.5 px-3">When</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Reference / Note</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3 text-right">Balance After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map((tx) => {
                    const isCredit = tx.type === 'CREDIT' || tx.type === 'REVERSAL';
                    return (
                      <tr key={tx.id} className="hover:bg-surface-sunken/40 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-text-subtle whitespace-nowrap">
                          {formatDate(tx.createdAt)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <Badge tone={isCredit ? 'success' : tx.type === 'DEBIT' ? 'danger' : 'neutral'}>
                            {tx.type}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-text">
                              {tx.referenceType.replaceAll('_', ' ')}
                            </span>
                            {tx.note && (
                              <span className="text-[11px] text-text-subtle italic">
                                &ldquo;{tx.note}&rdquo;
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold whitespace-nowrap">
                          <span className={isCredit ? 'text-success' : 'text-danger'}>
                            {isCredit ? '+' : '−'}
                            {formatPaise(tx.amountPaise)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-text whitespace-nowrap">
                          {formatPaise(tx.balanceAfterPaise)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
