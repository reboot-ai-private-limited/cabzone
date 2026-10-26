'use client';

import { useDeferredValue, useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  History,
  Receipt,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
  Wallet,
} from 'lucide-react';
import type { DriverEarningsReconciliationDto } from '@cabzone/contracts';
import { Badge, Button, ErrorState, Input, PageHeader, Skeleton } from '@cabzone/design-system';
import { formatPaise } from '@/lib/format';
import { ApiError } from '@/lib/api/ApiError';
import { ridesApi } from '@/lib/api/endpoints/rides';
import { useFinanceStats, useTransactionsList } from '../hooks/useFinance';
import { TransactionsLedgerTable } from './TransactionsLedgerTable';
import { CashoutQueue } from './CashoutQueue';

export function FinanceScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [reconcileReport, setReconcileReport] = useState<DriverEarningsReconciliationDto | null>(
    null,
  );
  const deferredSearch = useDeferredValue(searchQuery);

  // Transaction Queries
  const statsQuery = useFinanceStats();
  const transactionsQuery = useTransactionsList({
    search: deferredSearch.trim() ? deferredSearch.trim() : undefined,
  });
  const stats =
    statsQuery.data?.driver && statsQuery.data.transactions ? statsQuery.data : undefined;

  const reconcileMutation = useMutation({
    mutationFn: () => ridesApi.reconcileEarnings({ mode: 'AUDIT' }),
    onSuccess: (report) => setReconcileReport(report),
  });

  const handleRefresh = () => {
    void statsQuery.refetch();
    void transactionsQuery.refetch();
  };

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8 max-w-[1600px] mx-auto w-full">
      {/* Page Header */}
      <PageHeader
        title="Transactions & Ledger"
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Transactions' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<ShieldAlert className="size-3.5 text-text-subtle" />}
              loading={reconcileMutation.isPending}
              onClick={() => reconcileMutation.mutate()}
            >
              Audit Settlements
            </Button>
            <Link href="/drivers">
              <Button
                size="sm"
                variant="secondary"
                icon={<Users className="size-3.5 text-text-subtle" />}
              >
                Driver Fleet &amp; Balances
              </Button>
            </Link>
            <Button
              size="sm"
              variant="secondary"
              icon={
                <RefreshCw
                  className={`size-3.5 ${
                    statsQuery.isFetching || transactionsQuery.isFetching ? 'animate-spin' : ''
                  }`}
                />
              }
              loading={statsQuery.isFetching || transactionsQuery.isFetching}
              onClick={handleRefresh}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {reconcileMutation.isError && (
        <ErrorState
          title="Settlement audit failed"
          message={
            reconcileMutation.error instanceof Error
              ? reconcileMutation.error.message
              : 'Could not run ride settlement audit.'
          }
          onRetry={() => reconcileMutation.mutate()}
        />
      )}

      {reconcileReport && (
        <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold text-text">
              <CheckCircle2 className="size-4 text-success" />
              <span>Ride Settlement Audit Report</span>
              <Badge tone={reconcileReport.issues.length === 0 ? 'success' : 'warning'}>
                {reconcileReport.issues.length === 0
                  ? 'ALL SETTLEMENTS CLEAN'
                  : `${reconcileReport.issues.length} DISCREPANCIES`}
              </Badge>
            </div>
            <button
              type="button"
              onClick={() => setReconcileReport(null)}
              className="text-text-subtle hover:text-text cursor-pointer"
            >
              Dismiss
            </button>
          </div>
          <div className="flex flex-wrap gap-4 font-mono text-text-subtle">
            <span>Checked rides: {reconcileReport.checkedSettledRides}</span>
            <span>Clean cash: {reconcileReport.cleanCashRides}</span>
            <span>Clean online: {reconcileReport.cleanOnlineRides}</span>
          </div>
          {reconcileReport.issues.length > 0 && (
            <ul className="mt-1 flex flex-col gap-1 font-mono text-text border-t border-border pt-2">
              {reconcileReport.issues.slice(0, 5).map((issue, idx) => (
                <li key={`${issue.code}-${issue.rideId ?? idx}`}>
                  [{issue.code}] Ride {issue.rideId?.slice(0, 8) ?? '—'} — {issue.detail}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <CashoutQueue />
      {/* KPI Cards for Transactions */}
      {statsQuery.isPending ? (
        <div
          role="status"
          aria-label="Loading finance summary"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="p-5 bg-surface border border-border rounded-xl space-y-5">
              <Skeleton className="w-32" />
              <Skeleton className="h-7 w-24" />
            </div>
          ))}
        </div>
      ) : statsQuery.isError || !stats ? (
        <ErrorState
          title="Finance summary unavailable"
          message="Could not load the latest finance figures."
          onRetry={
            statsQuery.error instanceof ApiError && statsQuery.error.status === 403
              ? undefined
              : () => void statsQuery.refetch()
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Platform Commissions */}
          <div className="p-5 bg-surface border border-border rounded-xl shadow-xs flex flex-col justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-text-subtle uppercase tracking-wider">
              <Receipt className="size-4 text-interactive" />
              <span>Platform commissions</span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono text-interactive tracking-tight">
                {formatPaise(stats.transactions.platformCommissionPaise)}
              </div>
              <p className="text-xs text-text-subtle mt-1">Earned via 8% trip deductions</p>
            </div>
          </div>

          {/* Card 2: Total Volume Processed */}
          <div className="p-5 bg-surface border border-border rounded-xl shadow-xs flex flex-col justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-text-subtle uppercase tracking-wider">
              <Coins className="size-4 text-slate-500" />
              <span>Total volume processed</span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono text-text tracking-tight">
                {formatPaise(stats.transactions.totalVolumePaise)}
              </div>
              <p className="text-xs text-text-subtle mt-1">Gross transaction turnover</p>
            </div>
          </div>

          {/* Card 3: Total Ledger Entries */}
          <div className="p-5 bg-surface border border-border rounded-xl shadow-xs flex flex-col justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-text-subtle uppercase tracking-wider">
              <History className="size-4 text-slate-500" />
              <span>Ledger audit entries</span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono text-text tracking-tight">
                {stats.transactions.totalTransactionsCount}
              </div>
              <p className="text-xs text-text-subtle mt-1">Double-entry audit log count</p>
            </div>
          </div>

          {/* Card 4: Company Arrears Shortcut */}
          <div className="p-5 bg-surface border border-border rounded-xl shadow-xs flex flex-col justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-text-subtle uppercase tracking-wider">
              <AlertTriangle className="size-4 text-amber-500" />
              <span>Driver arrears</span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono text-red-600 tracking-tight">
                {stats.driver.owedToCompanyPaise === undefined
                  ? '—'
                  : formatPaise(stats.driver.owedToCompanyPaise)}
              </div>
              <p className="text-xs text-text-subtle mt-1">
                {stats.driver.owedDriversCount === undefined
                  ? 'Driver count unavailable'
                  : `Across ${stats.driver.owedDriversCount} drivers`}{' '}
                · Managed in Driver Profiles
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Driver Balance Management Context Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-surface-muted/60 border border-border text-xs text-text-subtle">
        <div className="flex items-center gap-2.5">
          <Wallet className="size-4 text-interactive shrink-0" />
          <span>
            <strong className="text-text font-medium">
              Individual driver balances and settlements
            </strong>{' '}
            are now managed directly on each respective driver&apos;s profile under the Financials
            tab.
          </span>
        </div>
        <Link
          href="/drivers"
          className="inline-flex items-center gap-1 font-semibold text-interactive hover:underline shrink-0"
        >
          View Drivers Fleet &rarr;
        </Link>
      </div>

      {/* Transactions Search Input */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="finance-tx-search" className="text-xs font-semibold text-text">
          Search Transactions Ledger
        </label>
        <div className="relative w-full">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none" />
          <Input
            id="finance-tx-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by reference ID, ride ID, or audit note..."
            className="pl-9 text-sm h-11 w-full rounded-lg bg-surface border-border"
          />
        </div>
      </div>

      {/* Transactions Ledger Table */}
      <TransactionsLedgerTable
        transactions={transactionsQuery.data?.items ?? []}
        isLoading={transactionsQuery.isLoading}
      />
    </div>
  );
}
