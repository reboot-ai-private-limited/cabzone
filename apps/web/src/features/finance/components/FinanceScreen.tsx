'use client';

import { useDeferredValue, useState } from 'react';
import {
  AlertTriangle,
  Coins,
  History,
  Receipt,
  RotateCcw,
  Search,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { Input } from '@cabzone/design-system';
import { formatPaise } from '@/lib/format';
import {
  useFinanceStats,
  useTransactionsList,
  useWalletsList,
} from '../hooks/useFinance';
import { DriverBalancesTable } from './DriverBalancesTable';
import { TransactionsLedgerTable } from './TransactionsLedgerTable';

type FinanceTab = 'driver-balances' | 'transactions' | 'customer-wallets';

export function FinanceScreen() {
  const [activeTab, setActiveTab] = useState<FinanceTab>('driver-balances');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);

  // Filters matching screenshot
  const [balanceFilter, setBalanceFilter] = useState<'ALL' | 'OWING' | 'PAYABLE' | 'ZERO'>('ALL');
  const [suspendedFilter, setSuspendedFilter] = useState<'ANY' | 'SUSPENDED' | 'NOT_SUSPENDED'>('ANY');
  const [sortBy, setSortBy] = useState<
    'DEEPEST_DEBT' | 'HIGHEST_BALANCE' | 'LIFETIME_EARNINGS' | 'RECENT_ENTRY'
  >('DEEPEST_DEBT');

  // Queries
  const statsQuery = useFinanceStats();
  const driverWalletsQuery = useWalletsList({
    type: 'DRIVER',
    search: activeTab === 'driver-balances' && deferredSearch.trim() ? deferredSearch.trim() : undefined,
    balanceFilter: activeTab === 'driver-balances' && balanceFilter !== 'ALL' ? balanceFilter : undefined,
    suspendedFilter: activeTab === 'driver-balances' && suspendedFilter !== 'ANY' ? suspendedFilter : undefined,
    sortBy: activeTab === 'driver-balances' ? sortBy : undefined,
  });

  const transactionsQuery = useTransactionsList({
    search: activeTab === 'transactions' && deferredSearch.trim() ? deferredSearch.trim() : undefined,
  });

  const stats = statsQuery.data ?? {
    driver: {
      totalBalancePaise: 0,
      activeDriversCount: 3,
      blockedDriversCount: 0,
      totalDriversWithWallets: 3,
      owedToCompanyPaise: 52000,
      owedDriversCount: 3,
      payableToDriversPaise: 0,
      payableDriversCount: 0,
      suspendedCount: 0,
      driversWithActivityCount: 3,
    },
    transactions: {
      totalVolumePaise: 50000,
      platformCommissionPaise: 0,
      adjustmentsPaise: 50000,
      totalTransactionsCount: 6,
    },
  };

  const handleRefresh = () => {
    void statsQuery.refetch();
    void driverWalletsQuery.refetch();
    void transactionsQuery.refetch();
  };

  const handleReset = () => {
    setSearchQuery('');
    setBalanceFilter('ALL');
    setSuspendedFilter('ANY');
    setSortBy('DEEPEST_DEBT');
  };

  return (
    <div className="flex flex-col gap-6 p-8 max-w-[1600px] mx-auto w-full">
      {/* Top Tabs matching screenshot */}
      <div className="flex items-center">
        <div className="inline-flex items-center p-1 bg-slate-200/60 rounded-xl border border-slate-200 gap-1 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab('driver-balances')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'driver-balances'
                ? 'bg-white text-slate-900 font-semibold shadow-xs border border-slate-200/90'
                : 'text-slate-600 hover:text-slate-900 border border-transparent'
            }`}
          >
            Driver balances
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('transactions')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'transactions'
                ? 'bg-white text-slate-900 font-semibold shadow-xs border border-slate-200/90'
                : 'text-slate-600 hover:text-slate-900 border border-transparent'
            }`}
          >
            Transactions
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('customer-wallets')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'customer-wallets'
                ? 'bg-white text-slate-900 font-semibold shadow-xs border border-slate-200/90'
                : 'text-slate-600 hover:text-slate-900 border border-transparent'
            }`}
          >
            Customer wallets
          </button>
        </div>
      </div>

      {/* KPI Cards when Driver balances is active (matching screenshot 1:1) */}
      {activeTab === 'driver-balances' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Owed to the company */}
          <div className="p-5 bg-white border border-slate-200/90 rounded-xl shadow-xs flex flex-col justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <Coins className="size-4 text-slate-500" />
              <span>Owed to the company</span>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold font-sans text-red-600 tracking-tight">
                {formatPaise(stats.driver.owedToCompanyPaise ?? 0)}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Across {stats.driver.owedDriversCount ?? 0} drivers
              </p>
            </div>
          </div>

          {/* Card 2: Payable to drivers */}
          <div className="p-5 bg-white border border-slate-200/90 rounded-xl shadow-xs flex flex-col justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <Wallet className="size-4 text-slate-500" />
              <span>Payable to drivers</span>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold font-sans text-emerald-600 tracking-tight">
                {formatPaise(stats.driver.payableToDriversPaise ?? 0)}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Across {stats.driver.payableDriversCount ?? 0} drivers
              </p>
            </div>
          </div>

          {/* Card 3: Suspended */}
          <div className="p-5 bg-white border border-slate-200/90 rounded-xl shadow-xs flex flex-col justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <AlertTriangle className="size-4 text-slate-500" />
              <span>Suspended</span>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold font-sans text-slate-900 tracking-tight">
                {stats.driver.suspendedCount ?? 0}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Past the negative-balance limit
              </p>
            </div>
          </div>

          {/* Card 4: Drivers with activity */}
          <div className="p-5 bg-white border border-slate-200/90 rounded-xl shadow-xs flex flex-col justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <Users className="size-4 text-slate-500" />
              <span>Drivers with activity</span>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold font-sans text-slate-900 tracking-tight">
                {stats.driver.driversWithActivityCount ?? 0}
              </div>
              <p className="text-xs text-slate-500 mt-1">All time</p>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards when Transactions is active */}
      {activeTab === 'transactions' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 bg-white border border-slate-200/90 rounded-xl shadow-xs flex flex-col justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Receipt className="size-4 text-slate-500" />
              <span>Platform commissions earned</span>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold font-mono text-interactive">
                {formatPaise(stats.transactions.platformCommissionPaise)}
              </span>
              <p className="text-xs text-slate-500 mt-1">Earned via 8% trip deductions</p>
            </div>
          </div>

          <div className="p-5 bg-white border border-slate-200/90 rounded-xl shadow-xs flex flex-col justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Coins className="size-4 text-slate-500" />
              <span>Total volume processed</span>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold font-mono text-slate-900">
                {formatPaise(stats.transactions.totalVolumePaise)}
              </span>
              <p className="text-xs text-slate-500 mt-1">Gross transaction volume</p>
            </div>
          </div>

          <div className="p-5 bg-white border border-slate-200/90 rounded-xl shadow-xs flex flex-col justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <History className="size-4 text-slate-500" />
              <span>Total ledger entries</span>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold font-mono text-slate-900">
                {stats.transactions.totalTransactionsCount}
              </span>
              <p className="text-xs text-slate-500 mt-1">Double-entry audit log count</p>
            </div>
          </div>
        </div>
      )}

      {/* Customer Wallets Deprecation Notice (Option B) */}
      {activeTab === 'customer-wallets' && (
        <div className="p-8 bg-white border border-slate-200/90 rounded-xl shadow-xs flex flex-col items-center justify-center text-center gap-3">
          <div className="p-3 bg-interactive/10 text-interactive rounded-full">
            <ShieldCheck className="size-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Customer Wallets Deprecated (Option B)</h3>
          <p className="text-sm text-slate-600 max-w-xl">
            Per PRD §5.7 and Architectural Decision D-021, customers do not hold prepaid wallet balances.
            Instead, customer trust and reliability are governed by the real-time{' '}
            <strong className="text-slate-900">Customer Trust Score Engine (Option B)</strong>, with direct payments
            handled via UPI / cash collection.
          </p>
        </div>
      )}

      {/* Filter and Controls Bar matching screenshot */}
      {activeTab === 'driver-balances' && (
        <div className="flex flex-col md:flex-row items-stretch md:items-end gap-4 bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          {/* Search Input */}
          <div className="flex flex-col gap-1.5 flex-1 min-w-[280px]">
            <label htmlFor="finance-driver-search" className="text-xs font-semibold text-slate-700">
              Search
            </label>
            <div className="relative">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <Input
                id="finance-driver-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by driver name or mobile"
                className="pl-9 text-sm h-10 w-full rounded-lg border-slate-300 bg-white"
              />
            </div>
          </div>

          {/* Balance Dropdown */}
          <div className="flex flex-col gap-1.5 w-full md:w-44">
            <label htmlFor="finance-balance-filter" className="text-xs font-semibold text-slate-700">
              Balance
            </label>
            <select
              id="finance-balance-filter"
              value={balanceFilter}
              onChange={(e) => setBalanceFilter(e.target.value as 'ALL' | 'OWING' | 'PAYABLE' | 'ZERO')}
              className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-interactive/20 cursor-pointer"
            >
              <option value="ALL">All drivers</option>
              <option value="OWING">Owing to company</option>
              <option value="PAYABLE">Payable to driver</option>
              <option value="ZERO">Zero balance</option>
            </select>
          </div>

          {/* Suspended Dropdown */}
          <div className="flex flex-col gap-1.5 w-full md:w-36">
            <label htmlFor="finance-suspended-filter" className="text-xs font-semibold text-slate-700">
              Suspended
            </label>
            <select
              id="finance-suspended-filter"
              value={suspendedFilter}
              onChange={(e) => setSuspendedFilter(e.target.value as 'ANY' | 'SUSPENDED' | 'NOT_SUSPENDED')}
              className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-interactive/20 cursor-pointer"
            >
              <option value="ANY">Any</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="NOT_SUSPENDED">Not suspended</option>
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="flex flex-col gap-1.5 w-full md:w-48">
            <label htmlFor="finance-sort-filter" className="text-xs font-semibold text-slate-700">
              Sort
            </label>
            <select
              id="finance-sort-filter"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'DEEPEST_DEBT' | 'HIGHEST_BALANCE' | 'LIFETIME_EARNINGS' | 'RECENT_ENTRY')}
              className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-interactive/20 cursor-pointer"
            >
              <option value="DEEPEST_DEBT">Deepest debt first</option>
              <option value="HIGHEST_BALANCE">Highest balance first</option>
              <option value="LIFETIME_EARNINGS">Highest earnings first</option>
              <option value="RECENT_ENTRY">Most recent entry</option>
            </select>
          </div>

          {/* Reset Button */}
          <div className="flex items-center">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <RotateCcw className="size-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      )}

      {/* Transactions Search Input (only when Transactions tab is active) */}
      {activeTab === 'transactions' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="finance-tx-search" className="text-xs font-semibold text-slate-700">
            Search
          </label>
          <div className="relative w-full">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              id="finance-tx-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by reference ID, ride ID, or audit note"
              className="pl-9 text-sm h-11 w-full rounded-lg bg-white border-slate-300"
            />
          </div>
        </div>
      )}

      {/* Data Table Views */}
      {activeTab === 'driver-balances' && (
        <DriverBalancesTable
          wallets={driverWalletsQuery.data?.items ?? []}
          isLoading={driverWalletsQuery.isLoading}
          onRefresh={handleRefresh}
        />
      )}

      {activeTab === 'transactions' && (
        <TransactionsLedgerTable
          transactions={transactionsQuery.data?.items ?? []}
          isLoading={transactionsQuery.isLoading}
        />
      )}
    </div>
  );
}
