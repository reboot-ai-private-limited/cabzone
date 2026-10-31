'use client';

import { useEffect, useMemo, useState } from 'react';
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
  Lock,
  Printer,
  ShieldCheck,
  Star,
  Trash2,
  User,
  Wallet,
} from 'lucide-react';
import type { AdminRole, WalletSummaryDto, WalletTransactionDto } from '@cabzone/contracts';
import { getStoredAdminRole } from '@/features/auth/lib/authApi';
import { canAdminMutateFinance } from '@/features/rides/lib/adminRidePermissions';
import {
  hasDocumentPreviewFile,
  resolveSafeProfilePhotoUrl,
  type DriverDocumentAdminDto,
} from '@/lib/api/endpoints/drivers';
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
import { formatPublicRatingLabel } from '@cabzone/contracts';
import { ApiError } from '@/lib/api/ApiError';
import { formatPaise } from '@/lib/format';
import { useDriverApplication, useUpdateDriverStatus } from '../hooks/useDriverApplications';
import {
  useTransactionsList,
  useWalletDetail,
  useWalletsList,
} from '../../finance/hooks/useFinance';
import {
  mergeUniqueTransactions,
  resolveLedgerViewState,
  resolveWalletBalanceState,
} from '../../finance/lib/ledgerState';
import { AdjustBalanceDialog } from '../../finance/components/AdjustBalanceDialog';
import { SettleDriverDialog } from '../../finance/components/SettleDriverDialog';
import { DOCUMENT_TYPE_LABELS, DocumentPreviewDialog } from './DocumentPreviewDialog';
import {
  DocumentStatusBadge,
  DriverStatusBadge,
  KycStatusBadge,
  VehicleStatusBadge,
  computeDocumentExpiryBadge,
} from './StatusBadge';
import { TrustScoreBadge } from '../../identity/components/TrustScoreBadge';

export interface DriverDetailsScreenProps {
  id: string;
}

type TabKey = 'profile' | 'financials' | 'duty';

const DRIVER_LEDGER_PAGE_SIZE = 50;

const formatDate = (iso: string | null): string =>
  iso === null
    ? '—'
    : new Date(iso).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

const formatTime = (iso: string | null): string =>
  iso === null
    ? '—'
    : new Date(iso).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

export function DriverDetailsScreen({ id }: DriverDetailsScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabKey) || 'profile';

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DriverDocumentAdminDto | null>(null);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isSettleOpen, setIsSettleOpen] = useState(false);
  const canMutateFinance = canAdminMutateFinance(adminRole);

  useEffect(() => {
    setAdminRole(getStoredAdminRole());
  }, []);
  const [isSuspendConfirmOpen, setIsSuspendConfirmOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const updateStatusMutation = useUpdateDriverStatus(() => {
    setIsSuspendConfirmOpen(false);
    setSuspendReason('');
    void detailQuery.refetch();
  });
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // Financials filters & pagination
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [txOffset, setTxOffset] = useState<number>(0);
  const [loadedTransactions, setLoadedTransactions] = useState<WalletTransactionDto[]>([]);
  const [txTotal, setTxTotal] = useState<number | undefined>(undefined);

  // 1. Fetch Driver Application & Profile
  const detailQuery = useDriverApplication(id);
  const d = detailQuery.data;

  // Resolve Driver UUID for wallet and transactions
  const driverId = d?.application?.driverId || d?.driver?.id || id;

  useEffect(() => {
    setTxOffset(0);
    setLoadedTransactions([]);
    setTxTotal(undefined);
  }, [driverId]);

  // 2. Fetch Driver Wallet Detail, Server-Owned Summary & Paginated Ledger
  const walletQuery = useWalletDetail(driverId);
  const walletsSummaryQuery = useWalletsList({
    type: 'DRIVER',
    search: driverId,
    limit: 10,
  });
  const txQuery = useTransactionsList({
    driverId,
    limit: DRIVER_LEDGER_PAGE_SIZE,
    offset: txOffset,
  });

  useEffect(() => {
    if (!txQuery.data) return;
    setTxTotal(txQuery.data.total);
    setLoadedTransactions((prev) =>
      txOffset === 0
        ? mergeUniqueTransactions([], txQuery.data.items)
        : mergeUniqueTransactions(prev, txQuery.data.items),
    );
  }, [txQuery.data, txOffset]);

  const wallet = walletQuery.data?.wallet;
  const serverWalletSummary = useMemo(
    () => walletsSummaryQuery.data?.items.find((item) => item.ownerId === driverId) ?? null,
    [walletsSummaryQuery.data?.items, driverId],
  );

  // Honest Financial KPI state (never fabricates ₹0.00 during loading/error)
  const walletBalanceState = resolveWalletBalanceState({
    isPending: walletQuery.isPending,
    isError: walletQuery.isError,
    balancePaise: serverWalletSummary?.balancePaise ?? wallet?.balancePaise,
  });
  const balancePaise = walletBalanceState.balancePaise;
  const owedToCompanyPaise =
    balancePaise === null
      ? null
      : serverWalletSummary?.owedToCompanyPaise ?? Math.max(0, -balancePaise);
  const payableToDriverPaise =
    balancePaise === null
      ? null
      : serverWalletSummary?.payableToDriverPaise ?? Math.max(0, balancePaise);
  const lifetimeEarningsPaise: number | null =
    serverWalletSummary?.lifetimeEarningsPaise !== undefined
      ? serverWalletSummary.lifetimeEarningsPaise
      : walletsSummaryQuery.isSuccess && walletQuery.isSuccess && wallet === null
        ? 0
        : null;

  // Filtered transactions for ledger table
  const filteredTransactions = useMemo(() => {
    return loadedTransactions.filter((tx) => {
      // Type filter
      if (typeFilter !== 'ALL') {
        if (typeFilter === 'CREDIT' && tx.type !== 'CREDIT') return false;
        if (typeFilter === 'DEBIT' && tx.type !== 'DEBIT') return false;
        if (
          typeFilter === 'TRIP' &&
          !tx.note?.toLowerCase().includes('trip') &&
          tx.referenceType !== 'RIDE_COMMISSION'
        )
          return false;
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
  }, [loadedTransactions, typeFilter, fromDate, toDate]);

  const ledgerViewState = resolveLedgerViewState({
    itemCount: filteredTransactions.length,
    isLoading: txQuery.isPending && loadedTransactions.length === 0,
    isError: txQuery.isError && loadedTransactions.length === 0,
  });

  const hasMoreLedgerEntries =
    txTotal !== undefined &&
    loadedTransactions.length > 0 &&
    loadedTransactions.length < txTotal;

  const refreshFinancials = () => {
    void walletQuery.refetch();
    void walletsSummaryQuery.refetch();
    if (txOffset !== 0) {
      setTxOffset(0);
    } else {
      void txQuery.refetch();
    }
  };

  // Export handlers
  const handleExportCsv = () => {
    if (filteredTransactions.length === 0) return;
    const headers = [
      'Date',
      'Time',
      'Type',
      'Description',
      'Reference ID',
      'Amount (Paise)',
      'Balance After (Paise)',
    ];
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

  const driverDisplayName =
    d.driver?.name?.trim() ||
    (d.vehicle?.make ? `${d.vehicle.make} ${d.vehicle.model}` : `Driver #${driverId.slice(0, 8)}`);
  const driverIdDisplay = d.driver?.id ?? d.application.driverId ?? '—';
  const isSuspended = d.driver?.status === 'SUSPENDED';

  // Format Wallet for AdjustBalanceDialog and SettleDriverDialog only when wallet state is ready
  const walletSummaryForActions: WalletSummaryDto | null =
    balancePaise === null
      ? null
      : (serverWalletSummary ?? {
          id: wallet?.id ?? `uninitialized-${driverId}`,
          ownerType: 'DRIVER',
          ownerId: driverId,
          name: d.driver?.name ?? null,
          vehicleNumber: d.vehicle?.registrationNumber ?? null,
          balancePaise,
          spendableCreditPaise: Math.max(0, balancePaise),
          owedAmountPaise: Math.max(0, -balancePaise),
          owedToCompanyPaise: owedToCompanyPaise ?? Math.max(0, -balancePaise),
          payableToDriverPaise: payableToDriverPaise ?? Math.max(0, balancePaise),
          lifetimeEarningsPaise: lifetimeEarningsPaise ?? 0,
          status: (wallet?.status === 'ACTIVE' ? 'ACTIVE' : 'BLOCKED') as 'ACTIVE' | 'BLOCKED',
          createdAt: d.application.createdAt,
          updatedAt: wallet?.updatedAt ?? d.application.createdAt,
        });

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8 max-w-[1600px] mx-auto w-full">
      {/* Header with Title, Breadcrumb & Action Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Driver Details</h1>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500">
            <Link href="/" className="hover:text-slate-800 transition-colors">
              Home
            </Link>
            <span>&rsaquo;</span>
            <Link href="/drivers" className="hover:text-slate-800 transition-colors">
              Drivers
            </Link>
            <span>&rsaquo;</span>
            <span className="font-semibold text-slate-800">{driverDisplayName}</span>
          </nav>
        </div>

        {/* Header Actions */}
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

          <KycStatusBadge status={d.driver?.kycStatus} />

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

      {/* Tabs Bar */}
      <div
        role="tablist"
        aria-label="Driver sections"
        className="border-b border-slate-200 flex items-center gap-8 text-sm font-semibold select-none"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'profile'}
          onClick={() => setActiveTab('profile')}
          className={cn(
            'pb-2.5 pt-1 transition-all border-b-2 font-semibold',
            activeTab === 'profile'
              ? 'border-interactive text-interactive'
              : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          Profile &amp; Documents
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'financials'}
          onClick={() => setActiveTab('financials')}
          className={cn(
            'pb-2.5 pt-1 transition-all border-b-2 font-semibold',
            activeTab === 'financials'
              ? 'border-interactive text-interactive'
              : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          Financials
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'duty'}
          onClick={() => setActiveTab('duty')}
          className={cn(
            'pb-2.5 pt-1 transition-all border-b-2 font-semibold',
            activeTab === 'duty'
              ? 'border-interactive text-interactive'
              : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          Duty History
        </button>
      </div>

      {/* TAB 1: PROFILE & DOCUMENTS */}
      {activeTab === 'profile' && (
        <div className="flex flex-col gap-6">
          {/* Personal Details Card */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs flex flex-col gap-6">
            <h2 className="text-base font-semibold text-slate-900">Personal Details</h2>

            <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
              {/* Avatar & Identity Box */}
              <div className="flex flex-col items-center justify-center text-center w-full md:w-56 shrink-0 pt-1">
                {resolveSafeProfilePhotoUrl(d.driver?.profilePhotoUrl) ? (
                  <img
                    src={resolveSafeProfilePhotoUrl(d.driver?.profilePhotoUrl)!}
                    alt={driverDisplayName}
                    className="size-24 rounded-full object-cover border border-slate-200 shadow-xs mb-3"
                  />
                ) : (
                  <div className="size-24 rounded-full bg-interactive flex items-center justify-center text-white shadow-xs mb-3">
                    <User className="size-12 stroke-[1.75]" />
                  </div>
                )}
                <h3 className="font-bold text-slate-900 text-base">{driverDisplayName}</h3>
                <span className="text-xs text-slate-500 font-mono mt-0.5">
                  ID: {driverIdDisplay}
                </span>
                <span className="inline-flex items-center px-3 py-0.5 mt-2.5 rounded-full text-[11px] font-semibold tracking-wider uppercase bg-slate-100 text-slate-600 border border-slate-200">
                  {d.application.status}
                </span>
              </div>

              {/* 2-Column Key-Value Rows */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 flex-1 w-full border-t md:border-t-0 md:border-l border-slate-100 md:pl-8">
                {/* Column 1 */}
                <div className="flex flex-col">
                  <div className="flex items-center justify-between py-3.5 border-b border-slate-100 text-sm">
                    <span className="text-slate-500">Driver ID</span>
                    <span className="font-medium text-slate-900 font-mono">
                      {driverIdDisplay}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3.5 border-b border-slate-100 text-sm">
                    <span className="text-slate-500">Gender</span>
                    <span className="font-medium text-slate-900">{d.driver?.gender ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between py-3.5 border-b border-slate-100 text-sm">
                    <span className="text-slate-500">Date of Birth</span>
                    <span className="font-medium text-slate-900 font-mono">
                      {d.driver?.dateOfBirth ?? '—'}
                    </span>
                  </div>
                </div>

                {/* Column 2 */}
                <div className="flex flex-col">
                  <div className="flex items-center justify-between py-3.5 border-b border-slate-100 text-sm">
                    <span className="text-slate-500">Experience</span>
                    <span className="font-medium text-slate-900">
                      {d.driver?.experience ?? '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3.5 border-b border-slate-100 text-sm">
                    <span className="text-slate-500">Emergency Contact</span>
                    <span className="font-medium text-slate-900">
                      {d.driver?.hasEmergencyContact ? 'Configured (private)' : 'Not set'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3.5 border-b border-slate-100 text-sm">
                    <span className="text-slate-500">Address</span>
                    <span className="font-medium text-slate-900">
                      {d.driver?.address ?? '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3.5 border-b border-slate-100 text-sm">
                    <span className="text-slate-500">DL Number</span>
                    <span className="font-bold text-slate-950 font-mono">
                      {d.driver?.dlNumber ?? '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3.5 border-b border-slate-100 text-sm">
                    <span className="text-slate-500">DL Expiry</span>
                    <span className="font-medium text-slate-900 font-mono">
                      {d.driver?.dlExpiry ?? '—'}
                    </span>
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
                      <span className="text-text font-semibold">
                        {d.vehicle.make} {d.vehicle.model}
                      </span>
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
                  {d.driver?.status ? (
                    <DriverStatusBadge status={d.driver.status} />
                  ) : (
                    <Badge tone="neutral">{d.application.status}</Badge>
                  )}
                </div>

                <DefinitionList>
                  <FieldRow label="Trust Score">
                    <TrustScoreBadge score={d.driver?.trustScore} size="sm" />
                  </FieldRow>
                  <FieldRow label="Rating">
                    <div className="flex items-center gap-1 text-amber-500 font-semibold text-xs">
                      <Star className="size-3.5 fill-amber-500" />
                      <span>
                        {formatPublicRatingLabel(d.driver?.ratingAverage, d.driver?.ratingCount)}
                      </span>
                      <span className="text-text-subtle">
                        ({d.driver?.ratingCount ?? 0} reviews)
                      </span>
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
                      <ShieldCheck className="size-4 text-success" /> Verification Documents (
                      {d.documents.length})
                    </span>
                    <span className="text-xs text-text-subtle">
                      Government identification, driving licenses, and vehicle compliance
                    </span>
                  </div>
                </div>

                {d.documents.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-border rounded-xl text-text-subtle text-xs">
                    No documents uploaded for this application.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {d.documents.map((doc) => {
                      const expiryBadge = computeDocumentExpiryBadge(
                        doc.expiresAt,
                        doc.verificationStatus,
                      );
                      const hasFile = hasDocumentPreviewFile(doc);
                      const docLabel =
                        DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type.replace(/_/g, ' ');

                      return (
                        <div
                          key={doc.id}
                          className="rounded-lg border border-border bg-surface-muted/30 p-4 flex flex-col justify-between gap-3 hover:border-interactive/40 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-col">
                              <span className="font-semibold text-xs text-text">{docLabel}</span>
                              {doc.documentNumberMasked && (
                                <span className="text-xs font-mono text-text-subtle mt-0.5">
                                  {doc.documentNumberMasked}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <DocumentStatusBadge status={doc.verificationStatus} />
                              {expiryBadge && (
                                <Badge tone={expiryBadge.tone}>{expiryBadge.label}</Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 text-[11px] text-text-subtle">
                            <Lock className="size-3 text-interactive shrink-0" />
                            <span>
                              {hasFile
                                ? 'Stored in private KYC vault (audited preview)'
                                : 'Metadata record only'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
                            <span
                              className={
                                expiryBadge?.tone === 'danger'
                                  ? 'text-danger font-medium'
                                  : expiryBadge?.tone === 'warning'
                                    ? 'text-warning font-medium'
                                    : 'text-text-subtle'
                              }
                            >
                              {doc.expiresAt
                                ? `Expires: ${formatDate(doc.expiresAt)}`
                                : 'No expiry'}
                            </span>
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={<Eye className="size-3.5" />}
                              disabled={doc.storageKey === 'REDACTED'}
                              onClick={() => setSelectedDoc(doc)}
                            >
                              {doc.storageKey === 'REDACTED' ? 'KYC Restricted' : 'View Original'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
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
          {walletBalanceState.status === 'loading' ? (
            <div
              role="status"
              aria-label="Loading driver wallet summary"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
            >
              {['wallet-sk-1', 'wallet-sk-2', 'wallet-sk-3', 'wallet-sk-4'].map((skKey) => (
                <div
                  key={skKey}
                  className="rounded-xl border border-border bg-surface p-4 space-y-3 shadow-xs"
                >
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-3 w-36" />
                </div>
              ))}
            </div>
          ) : walletBalanceState.status === 'error' || balancePaise === null ? (
            <ErrorState
              title="Driver wallet unavailable"
              message={
                walletQuery.error instanceof Error
                  ? walletQuery.error.message
                  : 'Could not load this driver’s wallet balance.'
              }
              onRetry={
                walletQuery.error instanceof ApiError && walletQuery.error.status === 403
                  ? undefined
                  : refreshFinancials
              }
            />
          ) : (
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
                  ) : balancePaise > 0 ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                      Active Credit
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                      Zero Balance
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 pt-1">
                  <span
                    className={cn(
                      'text-2xl font-bold tracking-tight',
                      balancePaise < 0
                        ? 'text-red-600'
                        : balancePaise > 0
                          ? 'text-emerald-600'
                          : 'text-slate-900',
                    )}
                  >
                    {balancePaise < 0 ? `-${formatPaise(Math.abs(balancePaise))}` : formatPaise(balancePaise)}
                  </span>
                </div>
                <span className="text-xs text-text-subtle font-medium">
                  {balancePaise < 0
                    ? 'Driver owes this to company'
                    : balancePaise > 0
                      ? 'Spendable driver credit'
                      : wallet === null
                        ? 'No wallet movements recorded yet'
                        : 'Settled to zero'}
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
                    {formatPaise(owedToCompanyPaise ?? 0)}
                  </span>
                </div>
                <span className="text-xs text-text-subtle font-medium">
                  {(owedToCompanyPaise ?? 0) > 0 ? 'Outstanding arrears' : 'No arrears due'}
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
                    {formatPaise(payableToDriverPaise ?? 0)}
                  </span>
                </div>
                <span className="text-xs text-text-subtle font-medium">
                  {(payableToDriverPaise ?? 0) > 0
                    ? 'Eligible for withdrawal'
                    : 'No payout pending'}
                </span>
              </div>

              {/* Card 4: Server-Owned Lifetime Earnings */}
              <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-1 shadow-xs">
                <div className="flex items-center justify-between text-xs text-text-subtle">
                  <span className="font-semibold flex items-center gap-1.5 text-slate-700">
                    <IndianRupee className="size-3.5" /> Lifetime Earnings
                  </span>
                </div>
                <div className="flex items-baseline gap-2 pt-1">
                  {walletsSummaryQuery.isPending ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <span className="text-2xl font-bold tracking-tight text-slate-900">
                      {lifetimeEarningsPaise === null ? '—' : formatPaise(lifetimeEarningsPaise)}
                    </span>
                  )}
                </div>
                <span className="text-xs text-text-subtle font-medium">
                  {lifetimeEarningsPaise === null && !walletsSummaryQuery.isPending
                    ? 'Server earnings total unavailable'
                    : 'Server-verified trip earnings credited all-time'}
                </span>
              </div>
            </div>
          )}

          {/* Action Toolbar & Filters */}
          <div className="rounded-xl border border-border bg-surface p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              {/* Type Select */}
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="filter-tx-type"
                  className="text-[11px] font-semibold text-text-subtle uppercase tracking-wider"
                >
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
                <label
                  htmlFor="filter-from-date"
                  className="text-[11px] font-semibold text-text-subtle uppercase tracking-wider"
                >
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
                <label
                  htmlFor="filter-to-date"
                  className="text-[11px] font-semibold text-text-subtle uppercase tracking-wider"
                >
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
                disabled={filteredTransactions.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
              {canMutateFinance && (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={walletSummaryForActions === null}
                    icon={<CheckCircle2 className="size-3.5 text-emerald-600" />}
                    onClick={() => setIsSettleOpen(true)}
                  >
                    Settle Balance
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={walletSummaryForActions === null}
                    icon={<CreditCard className="size-3.5" />}
                    onClick={() => setIsAdjustOpen(true)}
                  >
                    Adjust Balance
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Ledger History Card & Table */}
          <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-xs flex flex-col">
            <div className="p-4 border-b border-border bg-surface-muted/30 flex items-center justify-between">
              <span className="text-sm font-bold text-text">Driver Financial Ledger</span>
              {ledgerViewState !== 'loading' && ledgerViewState !== 'error' && (
                <span className="text-xs text-text-subtle font-mono">
                  {typeFilter === 'ALL' && !fromDate && !toDate && txTotal !== undefined
                    ? `${filteredTransactions.length} of ${txTotal} ${txTotal === 1 ? 'record' : 'records'}`
                    : `${filteredTransactions.length} ${filteredTransactions.length === 1 ? 'record' : 'records'}`}
                </span>
              )}
            </div>

            {ledgerViewState === 'loading' ? (
              <div
                role="status"
                aria-label="Loading driver ledger"
                className="p-6 flex flex-col gap-3"
              >
                <Skeleton className="h-12 w-full rounded-md" />
                <Skeleton className="h-12 w-full rounded-md" />
                <Skeleton className="h-12 w-full rounded-md" />
              </div>
            ) : ledgerViewState === 'error' ? (
              <div className="p-6">
                <ErrorState
                  title="Driver ledger unavailable"
                  message={
                    txQuery.error instanceof Error
                      ? txQuery.error.message
                      : 'Could not load financial ledger entries for this driver.'
                  }
                  onRetry={
                    txQuery.error instanceof ApiError && txQuery.error.status === 403
                      ? undefined
                      : () => void txQuery.refetch()
                  }
                />
              </div>
            ) : ledgerViewState === 'empty' ? (
              <div className="p-12 text-center text-xs text-text-subtle flex flex-col items-center justify-center gap-2">
                <CreditCard className="size-8 text-text-subtle/50" />
                <span>No financial ledger records found matching this filter.</span>
              </div>
            ) : (
              <>
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
                        const isCredit = tx.type === 'CREDIT' || tx.type === 'REVERSAL';
                        const txTypeLabel = isCredit
                          ? tx.referenceType === 'RIDE_COMMISSION' ||
                            tx.referenceType === 'ONLINE_RIDE_EARNINGS' ||
                            tx.referenceType === 'CANCELLATION_COMPENSATION' ||
                            tx.referenceType === 'RIDER_ARREARS_COLLECTED'
                            ? 'Trip earning'
                            : 'Credit / reversal'
                          : tx.note?.toLowerCase().includes('cash')
                            ? 'Cash collected'
                            : 'Debit charge';

                        return (
                          <tr key={tx.id} className="hover:bg-surface-muted/40 transition-colors">
                            <td className="py-3.5 px-4 font-mono">
                              <div className="flex flex-col">
                                <span className="font-semibold text-text">
                                  {formatDate(tx.createdAt)}
                                </span>
                                <span className="text-[11px] text-text-subtle">
                                  {formatTime(tx.createdAt)}
                                </span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="font-semibold text-text">{txTypeLabel}</span>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex flex-col gap-0.5 max-w-md">
                                <span className="text-text font-medium">
                                  {tx.note || tx.referenceType.replaceAll('_', ' ')}
                                </span>
                                {tx.referenceId && (
                                  <span
                                    className="font-mono text-[11px] text-text-subtle truncate"
                                    title={tx.referenceId}
                                  >
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
                                {formatPaise(tx.amountPaise)}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono font-semibold">
                              <span
                                className={tx.balanceAfterPaise < 0 ? 'text-rose-600' : 'text-text'}
                              >
                                {tx.balanceAfterPaise < 0
                                  ? `-${formatPaise(Math.abs(tx.balanceAfterPaise))}`
                                  : formatPaise(tx.balanceAfterPaise)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {txQuery.isError && (
                  <div className="px-4 py-3 border-t border-border bg-surface-muted/30">
                    <ErrorState
                      title="Could not load older driver ledger entries"
                      message={
                        txQuery.error instanceof Error
                          ? txQuery.error.message
                          : 'Failed to load older transactions.'
                      }
                      onRetry={
                        txQuery.error instanceof ApiError && txQuery.error.status === 403
                          ? undefined
                          : () => void txQuery.refetch()
                      }
                    />
                  </div>
                )}

                {hasMoreLedgerEntries && (
                  <div className="px-4 py-3 border-t border-border bg-surface flex items-center justify-between gap-3">
                    <span className="text-xs text-text-subtle font-mono">
                      Loaded {loadedTransactions.length} of {txTotal} total entries
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={txQuery.isFetching && txOffset > 0}
                      onClick={() => {
                        if (!txQuery.isFetching) {
                          setTxOffset(loadedTransactions.length);
                        }
                      }}
                    >
                      Load older entries
                    </Button>
                  </div>
                )}
              </>
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
            {d.driver?.status ? (
              <DriverStatusBadge status={d.driver.status} />
            ) : (
              <Badge tone="neutral">{d.application.status}</Badge>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-surface-muted border border-border text-xs">
            <div className="flex flex-col">
              <span className="text-text-subtle font-medium">Account Standing</span>
              <span className="text-sm font-bold text-text">
                {d.driver?.status ?? d.application.status}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-text-subtle font-medium">Assigned Zone</span>
              <span className="text-sm font-bold text-text">
                {serverWalletSummary?.zoneName ?? '—'}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-text-subtle font-medium">KYC Standing</span>
              <span className="text-sm font-bold text-text font-mono">
                {d.driver?.kycStatus ?? '—'}
              </span>
            </div>
          </div>

          <div className="p-8 text-center text-xs text-text-subtle border border-dashed border-border rounded-xl">
            Live GPS presence and active trips are shown on the Live Rides dispatch radar when this
            driver goes online.
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      <DocumentPreviewDialog
        applicationId={d.application.id}
        document={selectedDoc}
        open={selectedDoc !== null}
        onOpenChange={(open) => !open && setSelectedDoc(null)}
      />

      {/* Admin Settle Driver Dialog */}
      {canMutateFinance && walletSummaryForActions && (
        <SettleDriverDialog
          wallet={walletSummaryForActions}
          open={isSettleOpen}
          onOpenChange={setIsSettleOpen}
          onSuccess={refreshFinancials}
        />
      )}

      {/* Admin Adjust Balance Dialog */}
      {canMutateFinance && walletSummaryForActions && (
        <AdjustBalanceDialog
          wallet={walletSummaryForActions}
          open={isAdjustOpen}
          onOpenChange={setIsAdjustOpen}
          onSuccess={refreshFinancials}
        />
      )}

      {/* Suspend Confirmation Dialog */}
      <Dialog
        open={isSuspendConfirmOpen}
        onOpenChange={setIsSuspendConfirmOpen}
        title={isSuspended ? 'Activate Driver Account' : 'Suspend Driver Account'}
        description={`Are you sure you want to ${isSuspended ? 'restore active dispatch privileges for' : 'suspend'} driver ${driverDisplayName}?`}
      >
        {!isSuspended && (
          <div className="flex flex-col gap-1.5 pt-2">
            <label htmlFor="suspend-reason-input" className="text-xs font-semibold text-text">
              Reason for suspension (optional)
            </label>
            <input
              id="suspend-reason-input"
              type="text"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="e.g. Safety complaint, expired insurance, unsettled dues..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-subtle focus:border-interactive focus:outline-none"
            />
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-4">
          <Button variant="ghost" onClick={() => setIsSuspendConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            variant={isSuspended ? 'primary' : 'danger'}
            loading={updateStatusMutation.isPending}
            onClick={() => {
              updateStatusMutation.mutate({
                id: d.application.id,
                status: isSuspended ? 'ACTIVE' : 'SUSPENDED',
                reason: suspendReason.trim() || null,
              });
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
