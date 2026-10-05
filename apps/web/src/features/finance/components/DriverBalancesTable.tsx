'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  ExternalLink,
  FileSpreadsheet,
  History,
  Printer,
  SlidersHorizontal,
} from 'lucide-react';
import type { WalletSummaryDto } from '@cabzone/contracts';
import { EmptyState, Skeleton } from '@cabzone/design-system';
import { formatPaise } from '@/lib/format';
import { AdjustBalanceDialog } from './AdjustBalanceDialog';
import { SettleDriverDialog } from './SettleDriverDialog';
import { WalletAuditModal } from './WalletAuditModal';

export interface DriverBalancesTableProps {
  wallets: WalletSummaryDto[];
  isLoading: boolean;
  onRefresh: () => void;
}

function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    return new Date(isoString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function DriverBalancesTable({
  wallets,
  isLoading,
  onRefresh,
}: DriverBalancesTableProps) {
  const [selectedWallet, setSelectedWallet] = useState<WalletSummaryDto | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  const handleSettleClick = (w: WalletSummaryDto) => {
    setSelectedWallet(w);
    setSettleOpen(true);
  };

  const handleAdjustClick = (w: WalletSummaryDto) => {
    setSelectedWallet(w);
    setAdjustOpen(true);
  };

  const handleAuditClick = (w: WalletSummaryDto) => {
    setSelectedWallet(w);
    setAuditOpen(true);
  };

  const handleExportExcel = () => {
    const headers = [
      'Driver Name',
      'Phone',
      'Vehicle',
      'Zone',
      'Owed to Company (Rs)',
      'Payable to Driver (Rs)',
      'Lifetime Earnings (Rs)',
      'Last Entry Date',
      'Entries Count',
      'Status',
    ];
    const rows = wallets.map((w) => [
      `"${(w.name || '').replace(/"/g, '""')}"`,
      `"${w.phoneE164}"`,
      `"${w.vehicleNumber || ''}"`,
      `"${w.zoneName || ''}"`,
      ((w.owedToCompanyPaise ?? 0) / 100).toFixed(2),
      ((w.payableToDriverPaise ?? 0) / 100).toFixed(2),
      ((w.lifetimeEarningsPaise ?? 0) / 100).toFixed(2),
      w.lastEntryDate ? formatDate(w.lastEntryDate) : '',
      w.entriesCount ?? 0,
      w.isSuspended ? 'Suspended' : 'Active',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `driver-balances-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPdf = () => {
    window.print();
  };

  return (
    <div className="flex flex-col bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden print:border-none print:shadow-none">
      {/* Table Card Header matching screenshot */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
        <h2 className="text-base font-semibold text-slate-900 tracking-tight">Driver balances</h2>
        <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="size-3.5 text-slate-500" />
            <span>Export Excel</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
          >
            <Printer className="size-3.5 text-slate-500" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-6 flex flex-col gap-3">
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      ) : wallets.length === 0 ? (
        <div className="p-8">
          <EmptyState
            title="No driver wallets found"
            description="No drivers match your search or filter criteria."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200/80 text-slate-500 text-xs font-semibold">
                <th className="py-3.5 px-6">Driver</th>
                <th className="py-3.5 px-6 text-right">Owed to company</th>
                <th className="py-3.5 px-6 text-right">Payable to driver</th>
                <th className="py-3.5 px-6 text-right">Lifetime earnings</th>
                <th className="py-3.5 px-6">Last entry</th>
                <th className="py-3.5 px-6">Status</th>
                <th className="py-3.5 px-6 text-right print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {wallets.map((wallet) => {
                const owedAmount = wallet.owedToCompanyPaise ?? 0;
                const payableAmount = wallet.payableToDriverPaise ?? 0;
                const lifetimeEarnings = wallet.lifetimeEarningsPaise ?? 0;

                return (
                  <tr
                    key={wallet.id}
                    className="hover:bg-slate-50/60 transition-colors group"
                  >
                    {/* Driver Column */}
                    <td className="py-4 px-6">
                      <div className="flex flex-col">
                        <Link
                          href={`/drivers/${wallet.ownerId}?tab=financials`}
                          className="font-semibold text-slate-900 text-sm hover:text-emerald-700 hover:underline inline-flex items-center gap-1 group/name w-fit"
                          title="View Driver Profile & Financials"
                        >
                          <span>{wallet.name || 'Dev Driver'}</span>
                          <ExternalLink className="size-3 text-slate-400 group-hover/name:text-emerald-600 transition-colors" />
                        </Link>
                        <span className="text-xs text-slate-500 font-mono mt-0.5">
                          {wallet.phoneE164}
                        </span>
                      </div>
                    </td>

                    {/* Owed to Company Column (Red bold font or —) */}
                    <td className="py-4 px-6 text-right">
                      {owedAmount > 0 ? (
                        <span className="font-bold text-red-600 font-sans text-sm">
                          {formatPaise(owedAmount)}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono">—</span>
                      )}
                    </td>

                    {/* Payable to Driver Column (Green bold font or —) */}
                    <td className="py-4 px-6 text-right">
                      {payableAmount > 0 ? (
                        <span className="font-bold text-emerald-600 font-sans text-sm">
                          {formatPaise(payableAmount)}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono">—</span>
                      )}
                    </td>

                    {/* Lifetime Earnings Column */}
                    <td className="py-4 px-6 text-right font-medium text-slate-800 text-sm">
                      {lifetimeEarnings > 0 ? formatPaise(lifetimeEarnings) : '—'}
                    </td>

                    {/* Last Entry Column */}
                    <td className="py-4 px-6">
                      <div className="flex flex-col">
                        <span className="text-slate-900 text-sm font-medium">
                          {formatDate(wallet.lastEntryDate)}
                        </span>
                        <span className="text-xs text-slate-500 mt-0.5">
                          {wallet.entriesCount ?? 0} entries
                        </span>
                      </div>
                    </td>

                    {/* Status Column */}
                    <td className="py-4 px-6">
                      {wallet.isSuspended ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">
                          Suspended
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono">—</span>
                      )}
                    </td>

                    {/* Actions Column */}
                    <td className="py-4 px-6 text-right print:hidden">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/drivers/${wallet.ownerId}?tab=financials`}
                          className="px-2.5 py-1 rounded-md text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                          title="Open Driver Financials Profile"
                        >
                          <span>Profile</span>
                          <ArrowUpRight className="size-3" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleSettleClick(wallet)}
                          className="px-2.5 py-1 rounded-md text-xs font-semibold text-slate-800 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                        >
                          Settle
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAuditClick(wallet)}
                          title="Ledger history"
                          aria-label="Ledger history"
                          className="size-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-colors cursor-pointer"
                        >
                          <History className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdjustClick(wallet)}
                          title="Adjust balance"
                          aria-label="Adjust balance"
                          className="size-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-colors cursor-pointer"
                        >
                          <SlidersHorizontal className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Settle Driver Dialog */}
      <SettleDriverDialog
        wallet={selectedWallet}
        open={settleOpen}
        onOpenChange={setSettleOpen}
        onSuccess={onRefresh}
      />

      {/* Adjust Dialog */}
      <AdjustBalanceDialog
        wallet={selectedWallet}
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        onSuccess={onRefresh}
      />

      {/* Audit Drawer/Modal */}
      <WalletAuditModal
        wallet={selectedWallet}
        open={auditOpen}
        onOpenChange={setAuditOpen}
        onAdjustClick={() => {
          setAuditOpen(false);
          setAdjustOpen(true);
        }}
      />
    </div>
  );
}
