'use client';

import type { WalletTransactionDto } from '@cabzone/contracts';
import { Badge, EmptyState, Skeleton } from '@cabzone/design-system';
import { formatPaise } from '@/lib/format';

export interface TransactionsLedgerTableProps {
  transactions: WalletTransactionDto[];
  isLoading: boolean;
}

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function TransactionsLedgerTable({
  transactions,
  isLoading,
}: TransactionsLedgerTableProps) {
  return (
    <div className="flex flex-col bg-surface border border-border rounded-xl shadow-xs overflow-hidden">
      {/* Table Card Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-text">Platform transactions</h2>
          <span className="text-xs font-mono text-text-subtle">
            ({transactions.length} entries)
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="p-6 flex flex-col gap-3">
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="p-8">
          <EmptyState
            title="No transactions recorded"
            description="No ledger movements match the current filter."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-surface-muted/60 border-b border-border text-text-subtle text-xs font-semibold uppercase">
                <th className="py-3 px-6">When</th>
                <th className="py-3 px-6">Type</th>
                <th className="py-3 px-6">Entity</th>
                <th className="py-3 px-6">Reason / Reference</th>
                <th className="py-3 px-6 text-right">Amount</th>
                <th className="py-3 px-6 text-right">Balance After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.map((tx) => {
                const isCredit = tx.type === 'CREDIT' || tx.type === 'REVERSAL';

                return (
                  <tr
                    key={tx.id}
                    className="hover:bg-surface-sunken/40 transition-colors"
                  >
                    {/* Timestamp */}
                    <td className="py-3.5 px-6 font-mono text-xs text-text-subtle whitespace-nowrap">
                      {formatDate(tx.createdAt)}
                    </td>

                    {/* Transaction Type */}
                    <td className="py-3.5 px-6 whitespace-nowrap">
                      <Badge
                        tone={
                          isCredit
                            ? 'success'
                            : tx.type === 'DEBIT'
                            ? 'danger'
                            : 'neutral'
                        }
                      >
                        {tx.type}
                      </Badge>
                    </td>

                    {/* Entity */}
                    <td className="py-3.5 px-6 whitespace-nowrap">
                      <Badge tone={tx.ownerType === 'RIDER' ? 'info' : 'neutral'}>
                        {tx.ownerType === 'RIDER' ? 'Customer' : 'Driver'}
                      </Badge>
                    </td>

                    {/* Reference & Note */}
                    <td className="py-3.5 px-6">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-text text-xs">
                          {tx.referenceType.replaceAll('_', ' ')}
                        </span>
                        {tx.note && (
                          <span className="text-[11px] text-text-subtle italic">
                            &ldquo;{tx.note}&rdquo;
                          </span>
                        )}
                        {tx.referenceId && (
                          <span className="font-mono text-[10px] text-text-subtle">
                            Ref: {tx.referenceId}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-6 text-right font-mono font-semibold whitespace-nowrap">
                      <span className={isCredit ? 'text-success' : 'text-danger'}>
                        {isCredit ? '+' : '−'}
                        {formatPaise(tx.amountPaise)}
                      </span>
                    </td>

                    {/* Balance After */}
                    <td className="py-3.5 px-6 text-right font-mono text-text whitespace-nowrap">
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
  );
}
