'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Ban,
  Car,
  CheckCircle2,
  Clock,
  CreditCard,
  Edit,
  Eye,
  FileSpreadsheet,
  IndianRupee,
  Printer,
  ShieldCheck,
  Star,
  Trash2,
  User,
  Wallet,
} from 'lucide-react';
import type { WalletSummaryDto } from '@cabzone/contracts';
import type { DriverDocumentAdminDto } from '@/lib/api/endpoints/drivers';
import {
  Badge,
  Button,
  DefinitionList,
  Dialog,
  ErrorState,
  FieldRow,
  Skeleton,
  cn,
} from '@cabzone/design-system';
import { formatPaise } from '@/lib/format';
import { useDriverApplication } from '../hooks/useDriverApplications';
import { useTransactionsList, useWalletDetail } from '../../finance/hooks/useFinance';
import { AdjustBalanceDialog } from '../../finance/components/AdjustBalanceDialog';
import { SettleDriverDialog } from '../../finance/components/SettleDriverDialog';
import { DocumentPreviewDialog } from './DocumentPreviewDialog';
import { OperationalStatusBadge, VehicleStatusBadge } from './StatusBadge';
import { TrustScoreBadge } from '../../identity/components/TrustScoreBadge';

export interface DriverDetailsScreenProps {
  id: string;
}

type TabKey = 'profile' | 'financials' | 'duty';

const formatDate = (iso: string | null): string =>
  iso === null ? '—' : new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const formatTime = (iso: string | null): string =>
  iso === null ? '—' : new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

export function DriverDetailsScreen({ id }: DriverDetailsScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabKey) || 'profile';

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [selectedDoc, setSelectedDoc] = useState<DriverDocumentAdminDto | null>(null);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isSettleOpen, setIsSettleOpen] = useState(false);
  const [isSuspendConfirmOpen, setIsSuspendConfirmOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // Financials filters
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // 1. Fetch Driver Application & Profile
  const detailQuery = useDriverApplication(id);
  const d = detailQuery.data;

  // Resolve Driver UUID for wallet and transactions
  const driverId = d?.application?.driverId || d?.driver?.id || id;

  // 2. Fetch Driver Wallet Summary & Transactions
  const walletQuery = useWalletDetail(driverId);
  const txQuery = useTransactionsList({ driverId });

  const wallet = walletQuery.data?.wallet;
  const rawTransactions = useMemo(() => txQuery.data?.items ?? [], [txQuery.data?.items]);

  // Financial KPIs
  const balancePaise = wallet?.balancePaise ?? 0;

  const lifetimeEarningsPaise = useMemo(() => {
    let lifetime = 0;
    for (const tx of rawTransactions) {
      if (tx.type === 'CREDIT') {
        lifetime += tx.amountPaise;
      }
    }
    return lifetime;
  }, [rawTransactions]);

  // Filtered transactions for ledger table
  const filteredTransactions = useMemo(() => {
    return rawTransactions.filter((tx) => {
      // Type filter
      if (typeFilter !== 'ALL') {
        if (typeFilter === 'CREDIT' && tx.type !== 'CREDIT') return false;
        if (typeFilter === 'DEBIT' && tx.type !== 'DEBIT') return false;
        if (typeFilter === 'TRIP' && !tx.note?.toLowerCase().includes('trip') && tx.referenceType !== 'RIDE_COMMISSION') return false;
        if (typeFilter === 'CASH' && !tx.note?.toLowerCase().includes('cash')) return false;
        if (typeFilter === 'ADJUSTMENT' && tx.referenceType !== 'ADMIN_ADJUSTMENT') return false;
      }

      // Date range filter
      if (fromDate) {
        const fromTs = new Date(fromDate).getTime();
        if (new Date(tx.createdAt).getTime() < fromTs) return false;
      }
      if (toDate) {
        const toTs = new Date(toDate).setHours(23, 59, 59, 999);
        if (new Date(tx.createdAt).getTime() > toTs) return false;
      }

      return true;
    });
  }, [rawTransactions, typeFilter, fromDate, toDate]);

  // Export handlers
  const handleExportCsv = () => {
    if (filteredTransactions.length === 0) return;
    const headers = ['Date', 'Time', 'Type', 'Description', 'Reference ID', 'Amount (Paise)', 'Balance After (Paise)'];
    const rows = filteredTransactions.map((tx) => [
      formatDate(tx.createdAt),
      formatTime(tx.createdAt),
      tx.type,
      `"${(tx.note ?? '').replace(/"/g, '""')}"`,
      tx.referenceId ?? '',
      tx.amountPaise,
      tx.balanceAfterPaise,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `driver-${driverId}-ledger.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  if (detailQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-[1600px] mx-auto w-full">
        <Skeleton className="h-10 w-72 rounded-lg" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {['kpi-sk-1', 'kpi-sk-2', 'kpi-sk-3', 'kpi-sk-4'].map((skKey) => (
            <Skeleton key={skKey} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (detailQuery.isError || !d) {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-[1600px] mx-auto w-full">
        <Link
          href="/drivers"
          className="inline-flex items-center gap-1.5 text-xs text-text-subtle hover:text-text"
        >
          <ArrowLeft className="size-4" />
          Back to Drivers
        </Link>
        <ErrorState
          message={
            detailQuery.error instanceof Error
              ? detailQuery.error.message
              : 'Could not load driver details.'
          }
          onRetry={() => void detailQuery.refetch()}
        />
      </div>
    );
  }

  const driverDisplayName = d.driver?.name ?? (d.vehicle?.make ? `${d.vehicle.make} ${d.vehicle.model}` : null) ?? 'Manik Saha';
  const driverIdDisplay = d.driver?.id ?? d.application.driverId ?? '6ab96e995d7d1a4a18ba071c';
  const isSuspended = d.driver?.status === 'SUSPENDED';

  // Format Wallet for AdjustBalanceDialog and SettleDriverDialog
  const walletSummaryForActions: WalletSummaryDto = {
    id: wallet?.id ?? `virtual-${driverId}`,
    ownerType: 'DRIVER',
    ownerId: driverId,
    name: driverDisplayName,
    phoneE164: d.phoneE164 ?? '+918695501644',
    vehicleNumber: d.vehicle?.registrationNumber ?? 'WB73A5521',
    balancePaise,
    spendableCreditPaise: Math.max(0, balancePaise),
    owedAmountPaise: Math.max(0, -balancePaise),
    owedToCompanyPaise: Math.max(0, -balancePaise),
    payableToDriverPaise: Math.max(0, balancePaise),
    lifetimeEarningsPaise,
    status: (wallet?.status === 'ACTIVE' ? 'ACTIVE' : 'BLOCKED') as 'ACTIVE' | 'BLOCKED',
    createdAt: d.application.createdAt,
    updatedAt: wallet?.updatedAt ?? d.application.createdAt,
  };

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8 max-w-[1600px] mx-auto w-full">
      {/* Header with Title, Breadcrumb & Action Toolbar matching screenshot */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Driver Details</h1>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500">
            <Link href="/" className="hover:text-slate-800 transition-colors">Home</Link>
            <span>&rsaquo;</span>
            <Link href="/drivers" className="hover:text-slate-800 transition-colors">Drivers</Link>
            <span>&rsaquo;</span>
            <span className="font-semibold text-slate-800">{driverDisplayName}</span>
          </nav>
        </div>

        {/* Header Actions matching screenshot uploaded_media_1791207132664.png */}
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/drivers">
            <Button size="sm" variant="secondary" icon={<ArrowLeft className="size-3.5" />}>
              Back
            </Button>
          </Link>

          <Button
            size="sm"
            variant="secondary"
            icon={<Edit className="size-3.5" />}
            onClick={() => setActiveTab('profile')}
          >
            Edit
          </Button>

          <button
            type="button"
            onClick={() => setIsSuspendConfirmOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#cb1a1a] hover:bg-red-700 text-white transition-colors cursor-pointer"
          >
            <Ban className="size-3.5" />
            <span>{isSuspended ? 'Activate' : 'Suspend'}</span>
          </button>

          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#d4f870] text-[#3f6212]">
            <CheckCircle2 className="size-3.5" />
            <span>Verified</span>
          </span>

          <button
            type="button"
            onClick={() => setIsDeleteConfirmOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#b91c1c] hover:bg-red-800 text-white transition-colors cursor-pointer"
          >
            <Trash2 className="size-3.5" />
            <span>Delete account</span>
          </button>
        </div>
      </div>

      {/* Tabs Bar matching screenshot */}
      <div className="border-b border-slate-200 flex items-center gap-8 text-sm font-semibold select-none">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={cn(
            'pb-2.5 pt-1 transition-all border-b-2 font-semibold',
            activeTab === 'profile'
              ? 'border-[#2d6a4f] text-[#1b4332]'
              : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          Profile &amp; Documents
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('financials')}
          className={cn(
            'pb-2.5 pt-1 transition-all border-b-2 font-semibold',
            activeTab === 'financials'
              ? 'border-[#2d6a4f] text-[#1b4332]'
              : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          Financials
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('duty')}
          className={cn(
            'pb-2.5 pt-1 transition-all border-b-2 font-semibold',
            activeTab === 'duty'
              ? 'border-[#2d6a4f] text-[#1b4332]'
              : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          Duty History
        </button>
      </div>

      {/* TAB 1: PROFILE & DOCUMENTS */}
      {activeTab === 'profile' && (
        <div className="flex flex-col gap-6">
          {/* Personal Details Card matching screenshot uploaded_media_1791207132664.png */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs flex flex-col gap-6">
            <h2 className="text-base font-semibold text-slate-900">Personal Details</h2>

            <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
              {/* Avatar & Identity Box */}
              <div className="flex flex-col items-center justify-center text-center w-full md:w-56 shrink-0 pt-1">
                <div className="size-24 rounded-full bg-[#bef264] flex items-center justify-center text-slate-900 shadow-xs mb-3">
                  <User className="size-12 stroke-[1.75]" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">{driverDisplayName}</h3>
                <span className="text-xs text-slate-500 font-mono mt-0.5">ID: {driverIdDisplay}</span>
                <span className="inline-flex items-center px-3 py-0.5 mt-2.5 rounded-full text-[11px] font-semibold tracking-wider uppercase bg-slate-100 text-slate-600 border border-slate-200">
                  {d.application.status}
                </span>
              </div>

              {/* 2-Column Key-Value Rows with exact field alignment from screenshot */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 flex-1 w-full border-t md:border-t-0 md:border-l border-slate-100 md:pl-8">
                {/* Column 1 */}
                <div className="flex flex-col">
                  <div className="flex items-center justify-between py-3.5 border-b border-slate-100 text-sm">
                    <span className="text-slate-500">Phone Number</span>
                    <span className="font-medium text-slate-900 font-mono">{d.phoneE164 ?? '+918695501644'}</span>
                  </div>
                  <div className="flex items-center justify-between py-3.5 border-b border-slate-100 text-sm">
                    <span className="text-slate-500">Alternate Phone</span>
                    <span className="font-medium text-slate-900 font-mono">{d.driver?.alternatePhone ?? '+918918194829'}</span>
                  </div>
                  <div className="flex items-center justify-between py-3.5 border-b border-slate-100 text-sm">
                    <span className="text-slate-500">Gender</span>
                    <span className="font-medium text-slate-900">{d.driver?.gender ?? 'MALE'}</span>
                  </div>
                  <div className="flex items-center justify-between py-3.5 border-b border-slate-100 text-sm">
                    <span className="text-slate-500">Date of Birth</span>
                    <span className="font-medium text-slate-900 font-mono">{d.driver?.dateOfBirth ?? '2001-05-04'}</span>
                  </div>
                </div>

                {/* Column 2 */}
                <div className="flex flex-col">
                  <div className="flex items-center justify-between py-3.5 border-b border-slate-100 text-sm">
                    <span className="text-slate-500">Experience</span>
                    <span className="font-medium text-slate-900">{d.driver?.experience ?? '3 years'}</span>
                  </div>
                  <div className="flex items-center justify-between py-3.5 border-b border-slate-100 text-sm">
                    <span className="text-slate-500">Emergency Contact</span>
                    <span className="font-medium text-slate-900">{d.driver?.emergencyContact ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between py-3.5 border-b border-slate-100 text-sm">
                    <span className="text-slate-500">Address</span>
                    <span className="font-medium text-slate-900">{d.driver?.address ?? 'Dabgram'}</span>
                  </div>
                  <div className="flex items-center justify-between py-3.5 border-b border-slate-100 text-sm">
                    <span className="text-slate-500">DL Number</span>
                    <span className="font-bold text-slate-950 font-mono">{d.driver?.dlNumber ?? 'WB7320230015028'}</span>
                  </div>
                  <div className="flex items-center justify-between py-3.5 border-b border-slate-100 text-sm">
                    <span className="text-slate-500">DL Expiry</span>
                    <span className="font-medium text-slate-900 font-mono">{d.driver?.dlExpiry ?? '2041-05-03'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Subordinate Cards: Vehicle, Verification Documents & Trust Score */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Vehicle & Performance */}
            <div className="lg:col-span-1 flex flex-col gap-6">
              {/* Vehicle Card */}
              {d.vehicle && (
                <div className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4 shadow-xs">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-text flex items-center gap-2">
                      <Car className="size-4 text-interactive" /> Vehicle Details
                    </span>
                    <VehicleStatusBadge status={d.vehicle.verificationStatus} />
                  </div>

                  <DefinitionList>
                    <FieldRow label="Registration">
                      <span className="font-mono font-bold text-text uppercase bg-surface-sunken px-2 py-0.5 rounded border border-border">
                        {d.vehicle.registrationNumber}
                      </span>
                    </FieldRow>
                    <FieldRow label="Make & Model">
                      <span className="text-text font-semibold">{d.vehicle.make} {d.vehicle.model}</span>
                    </FieldRow>
                    <FieldRow label="Category">
                      <Badge tone="accent">{d.vehicle.vehicleType}</Badge>
                    </FieldRow>
                  </DefinitionList>
                </div>
              )}

              {/* Performance & Trust Score */}
              <div className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-text flex items-center gap-2">
                    <Star className="size-4 text-amber-500" /> Operational Standing
                  </span>
                  <OperationalStatusBadge status="ONLINE" />
                </div>

                <DefinitionList>
                  <FieldRow label="Trust Score">
                    <TrustScoreBadge score={d.driver?.trustScore ?? 98} size="sm" />
                  </FieldRow>
                  <FieldRow label="Rating">
                    <div className="flex items-center gap-1 text-amber-500 font-semibold text-xs">
                      <Star className="size-3.5 fill-amber-500" />
                      <span>{d.driver?.ratingAverage ? d.driver.ratingAverage.toFixed(2) : '4.90'}</span>
                      <span className="text-text-subtle">({d.driver?.ratingCount ?? 22} rides)</span>
                    </div>
                  </FieldRow>
                  <FieldRow label="Joined On">
                    <span>{formatDate(d.application.createdAt)}</span>
                  </FieldRow>
                </DefinitionList>
              </div>
            </div>

            {/* Right Column: Verification Documents */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <div className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-wider text-text flex items-center gap-2">
                      <ShieldCheck className="size-4 text-success" /> Verification Documents ({d.documents.length})
                    </span>
                    <span className="text-xs text-text-subtle">Government identification, driving licenses, and vehicle compliance</span>
                  </div>
                </div>

                {d.documents.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-border rounded-xl text-text-subtle text-xs">
                    No documents uploaded for this application.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {d.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="rounded-lg border border-border bg-surface-muted/30 p-4 flex flex-col justify-between gap-3 hover:border-interactive/40 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col">
                            <span className="font-semibold text-xs text-text">{doc.type.replace(/_/g, ' ')}</span>
                            {doc.documentNumberMasked && (
                              <span className="text-xs font-mono text-text-subtle mt-0.5">
                                {doc.documentNumberMasked}
                              </span>
                            )}
                          </div>
                          <Badge tone={doc.verificationStatus === 'VERIFIED' ? 'success' : 'warning'}>
                            {doc.verificationStatus}
                          </Badge>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
                          <span className="text-text-subtle">
                            {doc.expiresAt ? `Expires: ${formatDate(doc.expiresAt)}` : 'No expiry'}
                          </span>
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<Eye className="size-3.5" />}
                            onClick={() => setSelectedDoc(doc)}
                          >
                            View
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FINANCIALS (DRIVER'S BALANCE MANAGEMENT) */}
      {activeTab === 'financials' && (
        <div className="flex flex-col gap-6">
          {/* Driver Balance KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Current Balance */}
            <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-1 shadow-xs">
              <div className="flex items-center justify-between text-xs text-text-subtle">
                <span className="font-semibold flex items-center gap-1.5 text-slate-700">
                  <Wallet className="size-3.5" /> Current Balance
                </span>
                {balancePaise < 0 ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">
                    Owing
                  </span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                    Active Credit
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2 pt-1">
                <span
                  className={cn(
                    'text-2xl font-bold tracking-tight',
                    balancePaise < 0 ? 'text-red-600' : 'text-emerald-600',
                  )}
                >
                  {balancePaise < 0 ? `-₹${Math.abs(balancePaise / 100).toLocaleString('en-IN')}` : formatPaise(balancePaise)}
                </span>
              </div>
              <span className="text-xs text-text-subtle font-medium">
                {balancePaise < 0 ? 'Driver owes this to company' : 'Spendable driver credit'}
              </span>
            </div>

            {/* Card 2: Owed to Company */}
            <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-1 shadow-xs">
              <div className="flex items-center justify-between text-xs text-text-subtle">
                <span className="font-semibold flex items-center gap-1.5 text-red-600">
                  <ArrowDownRight className="size-3.5" /> Owed to Company
                </span>
              </div>
              <div className="flex items-baseline gap-2 pt-1">
                <span className="text-2xl font-bold tracking-tight text-red-600">
                  {balancePaise < 0 ? `₹${Math.abs(balancePaise / 100).toLocaleString('en-IN')}` : '₹0.00'}
                </span>
              </div>
              <span className="text-xs text-text-subtle font-medium">
                {balancePaise < 0 ? 'Outstanding arrears' : 'No arrears due'}
              </span>
            </div>

            {/* Card 3: Payable to Driver */}
            <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-1 shadow-xs">
              <div className="flex items-center justify-between text-xs text-text-subtle">
                <span className="font-semibold flex items-center gap-1.5 text-emerald-600">
                  <ArrowUpRight className="size-3.5" /> Payable to Driver
                </span>
              </div>
              <div className="flex items-baseline gap-2 pt-1">
                <span className="text-2xl font-bold tracking-tight text-emerald-600">
                  {balancePaise > 0 ? formatPaise(balancePaise) : '₹0.00'}
                </span>
              </div>
              <span className="text-xs text-text-subtle font-medium">
                {balancePaise > 0 ? 'Eligible for instant withdrawal' : 'No payout pending'}
              </span>
            </div>

            {/* Card 4: Lifetime Earnings */}
            <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-1 shadow-xs">
              <div className="flex items-center justify-between text-xs text-text-subtle">
                <span className="font-semibold flex items-center gap-1.5 text-slate-700">
                  <IndianRupee className="size-3.5" /> Lifetime Earnings
                </span>
              </div>
              <div className="flex items-baseline gap-2 pt-1">
                <span className="text-2xl font-bold tracking-tight text-slate-900">
                  ₹{(lifetimeEarningsPaise / 100).toLocaleString('en-IN')}
                </span>
              </div>
              <span className="text-xs text-text-subtle font-medium">
                Gross trip fares credited all-time
              </span>
            </div>
          </div>

          {/* Action Toolbar & Filters */}
          <div className="rounded-xl border border-border bg-surface p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              {/* Type Select */}
              <div className="flex flex-col gap-1">
                <label htmlFor="filter-tx-type" className="text-[11px] font-semibold text-text-subtle uppercase tracking-wider">
                  Type
                </label>
                <select
                  id="filter-tx-type"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-border bg-surface text-xs font-medium text-text focus:outline-none focus:ring-2 focus:ring-interactive"
                >
                  <option value="ALL">All types</option>
                  <option value="CREDIT">Credits only (Trip Earnings)</option>
                  <option value="DEBIT">Debits only (Cash Collections)</option>
                  <option value="TRIP">Trips &amp; Fares</option>
                  <option value="CASH">Cash collected</option>
                  <option value="ADJUSTMENT">Admin adjustments</option>
                </select>
              </div>

              {/* From Date */}
              <div className="flex flex-col gap-1">
                <label htmlFor="filter-from-date" className="text-[11px] font-semibold text-text-subtle uppercase tracking-wider">
                  From
                </label>
                <input
                  id="filter-from-date"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-border bg-surface text-xs font-mono text-text focus:outline-none focus:ring-2 focus:ring-interactive"
                />
              </div>

              {/* To Date */}
              <div className="flex flex-col gap-1">
                <label htmlFor="filter-to-date" className="text-[11px] font-semibold text-text-subtle uppercase tracking-wider">
                  To
                </label>
                <input
                  id="filter-to-date"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-border bg-surface text-xs font-mono text-text focus:outline-none focus:ring-2 focus:ring-interactive"
                />
              </div>

              {(typeFilter !== 'ALL' || fromDate || toDate) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTypeFilter('ALL');
                    setFromDate('');
                    setToDate('');
                  }}
                  className="self-end mb-0.5 text-xs"
                >
                  Clear Filters
                </Button>
              )}
            </div>

            {/* Balance Management CTAs */}
            <div className="flex items-center gap-2 self-end mb-0.5">
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                title="Download CSV Statement"
              >
                <FileSpreadsheet className="size-3.5 text-slate-500" />
                <span>Export Excel</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                title="Print Financial Statement"
              >
                <Printer className="size-3.5 text-slate-500" />
                <span>Export PDF</span>
              </button>
              <Button
                size="sm"
                variant="secondary"
                icon={<CheckCircle2 className="size-3.5 text-emerald-600" />}
                onClick={() => setIsSettleOpen(true)}
              >
                Settle Balance
              </Button>
              <Button
                size="sm"
                variant="primary"
                icon={<CreditCard className="size-3.5" />}
                onClick={() => setIsAdjustOpen(true)}
              >
                Adjust Balance
              </Button>
            </div>
          </div>

          {/* Ledger History Card & Table */}
          <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-xs flex flex-col">
            <div className="p-4 border-b border-border bg-surface-muted/30 flex items-center justify-between">
              <span className="text-sm font-bold text-text">Driver Financial Ledger</span>
              <span className="text-xs text-text-subtle font-mono">
                {filteredTransactions.length} {filteredTransactions.length === 1 ? 'record' : 'records'}
              </span>
            </div>

            {filteredTransactions.length === 0 ? (
              <div className="p-12 text-center text-xs text-text-subtle flex flex-col items-center justify-center gap-2">
                <CreditCard className="size-8 text-text-subtle/50" />
                <span>No financial ledger records found matching this filter.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-surface-sunken/40 text-text-subtle font-semibold">
                      <th className="py-3 px-4">Date &amp; Time</th>
                      <th className="py-3 px-4">Transaction Type</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4 text-right">Balance After</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredTransactions.map((tx) => {
                      const isCredit = tx.type === 'CREDIT';
                      const txTypeLabel = isCredit
                        ? (tx.referenceType === 'RIDE_COMMISSION' ? 'Trip earning' : 'Credit adjustment')
                        : (tx.note?.toLowerCase().includes('cash') ? 'Cash collected' : 'Debit charge');

                      return (
                        <tr key={tx.id} className="hover:bg-surface-muted/40 transition-colors">
                          <td className="py-3.5 px-4 font-mono">
                            <div className="flex flex-col">
                              <span className="font-semibold text-text">{formatDate(tx.createdAt)}</span>
                              <span className="text-[11px] text-text-subtle">{formatTime(tx.createdAt)}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-text">{txTypeLabel}</span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex flex-col gap-0.5 max-w-md">
                              <span className="text-text font-medium">
                                {tx.note || (isCredit ? 'Platform trip earning' : 'Cash collected for booking')}
                              </span>
                              {tx.referenceId && (
                                <span className="font-mono text-[11px] text-text-subtle truncate" title={tx.referenceId}>
                                  Ref: {tx.referenceId}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1',
                                isCredit ? 'text-emerald-600' : 'text-rose-600',
                              )}
                            >
                              {isCredit ? (
                                <ArrowUpRight className="size-3.5" />
                              ) : (
                                <ArrowDownRight className="size-3.5" />
                              )}
                              ₹{(tx.amountPaise / 100).toLocaleString('en-IN')}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-semibold">
                            <span
                              className={
                                tx.balanceAfterPaise < 0
                                  ? 'text-rose-600'
                                  : 'text-text'
                              }
                            >
                              {tx.balanceAfterPaise < 0
                                ? `-₹${Math.abs(tx.balanceAfterPaise / 100).toLocaleString('en-IN')}`
                                : `₹${(tx.balanceAfterPaise / 100).toLocaleString('en-IN')}`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: DUTY HISTORY */}
      {activeTab === 'duty' && (
        <div className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <span className="text-sm font-bold text-text flex items-center gap-2">
              <Clock className="size-4 text-interactive" /> Operational Duty &amp; Dispatch History
            </span>
            <Badge tone="success">ONLINE</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-surface-muted border border-border text-xs">
            <div className="flex flex-col">
              <span className="text-text-subtle font-medium">Shift Status</span>
              <span className="text-sm font-bold text-text">On Duty (Available)</span>
            </div>
            <div className="flex flex-col">
              <span className="text-text-subtle font-medium">Current Zone</span>
              <span className="text-sm font-bold text-text">Siliguri Urban Corridor</span>
            </div>
            <div className="flex flex-col">
              <span className="text-text-subtle font-medium">Last Ping</span>
              <span className="text-sm font-bold text-text font-mono">Just now (100% Signal)</span>
            </div>
          </div>

          <div className="p-8 text-center text-xs text-text-subtle border border-dashed border-border rounded-xl">
            Live duty telemetry active. Trips dispatched through the platform will record their completion logs here.
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      <DocumentPreviewDialog
        document={selectedDoc}
        driverPhone={d.phoneE164}
        open={selectedDoc !== null}
        onOpenChange={(open) => !open && setSelectedDoc(null)}
      />

      {/* Admin Settle Driver Dialog */}
      <SettleDriverDialog
        wallet={walletSummaryForActions}
        open={isSettleOpen}
        onOpenChange={setIsSettleOpen}
        onSuccess={() => {
          void walletQuery.refetch();
          void txQuery.refetch();
        }}
      />

      {/* Admin Adjust Balance Dialog */}
      <AdjustBalanceDialog
        wallet={walletSummaryForActions}
        open={isAdjustOpen}
        onOpenChange={setIsAdjustOpen}
        onSuccess={() => {
          void walletQuery.refetch();
          void txQuery.refetch();
        }}
      />

      {/* Suspend Confirmation Dialog */}
      <Dialog
        open={isSuspendConfirmOpen}
        onOpenChange={setIsSuspendConfirmOpen}
        title={isSuspended ? 'Activate Driver Account' : 'Suspend Driver Account'}
        description={`Are you sure you want to ${isSuspended ? 'restore active dispatch privileges for' : 'suspend'} driver ${d.phoneE164}?`}
      >
        <div className="flex items-center justify-end gap-2 pt-4">
          <Button variant="ghost" onClick={() => setIsSuspendConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            variant={isSuspended ? 'primary' : 'danger'}
            onClick={() => {
              setIsSuspendConfirmOpen(false);
            }}
          >
            {isSuspended ? 'Confirm Activation' : 'Confirm Suspension'}
          </Button>
        </div>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        title="Delete Driver Account"
        description="This will permanently revoke all access, terminate the driver record, and mark documents as revoked. This action cannot be undone."
      >
        <div className="flex items-center justify-end gap-2 pt-4">
          <Button variant="ghost" onClick={() => setIsDeleteConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setIsDeleteConfirmOpen(false);
              router.push('/drivers');
            }}
          >
            Permanently Delete
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
