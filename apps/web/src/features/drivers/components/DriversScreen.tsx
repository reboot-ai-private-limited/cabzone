'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Car,
  CheckCircle2,
  Clock,
  CreditCard,
  FileCheck,
  RefreshCw,
  Star,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  type Column,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  FilterField,
  PageHeader,
  Pagination,
  SearchInput,
  SegmentedControl,
  Select,
  Skeleton,
  StatTile,
} from '@cabzone/design-system';
import {
  DRIVER_APPLICATION_STATUSES,
  VEHICLE_CATEGORIES,
  type DriverApplicationStatus,
} from '@cabzone/contracts';
import type { DriverApplicationSummaryDto } from '@/lib/api/endpoints/drivers';
import { useDriverApplications } from '../hooks/useDriverApplications';
import { DriverDetailModal } from './DriverDetailModal';
import {
  DriverStatusBadge,
  OperationalStatusBadge,
  REVIEWABLE,
  StatusBadge,
} from './StatusBadge';

const PAGE_SIZE = 15;

type ViewMode = 'kyc' | 'fleet';
type KycFilter = 'ALL' | 'PENDING' | DriverApplicationStatus;
type FleetFilter = 'ALL' | 'ACTIVE' | 'SUSPENDED';

const KYC_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All Applications' },
  { value: 'PENDING', label: 'Needs Review (Queue)' },
  ...DRIVER_APPLICATION_STATUSES.map((s) => ({ value: s, label: s.replaceAll('_', ' ') })),
];

const FLEET_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All Fleet Drivers' },
  { value: 'ACTIVE', label: 'Active Drivers' },
  { value: 'SUSPENDED', label: 'Suspended Drivers' },
];

const VEHICLE_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All Vehicle Types' },
  ...VEHICLE_CATEGORIES.map((c) => ({ value: c, label: c.replaceAll('_', ' ') })),
];

const formatDate = (iso: string | null): string =>
  iso === null ? '—' : new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });

const formatTimeAgo = (iso: string | null): string => {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / (1000 * 60));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export function DriversScreen() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('kyc');
  const [searchQuery, setSearchQuery] = useState('');
  const [kycFilter, setKycFilter] = useState<KycFilter>('PENDING');
  const [fleetFilter, setFleetFilter] = useState<FleetFilter>('ALL');
  const [vehicleFilter, setVehicleFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);

  // Selected fleet profile modal
  const [selectedFleetDriver, setSelectedFleetDriver] =
    useState<DriverApplicationSummaryDto | null>(null);

  // Fetch all applications to power both KPI stats, the review queue, and fleet directory
  const appsQuery = useDriverApplications({ limit: 100 });
  const rawList = useMemo(() => appsQuery.data ?? [], [appsQuery.data]);

  // Compute platform-wide KPI Stats
  const stats = useMemo(() => {
    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;

    for (const item of rawList) {
      if (REVIEWABLE.has(item.application.status)) {
        pendingCount += 1;
      }
      if (item.application.status === 'APPROVED') {
        approvedCount += 1;
      } else if (item.application.status === 'REJECTED') {
        rejectedCount += 1;
      }
    }

    return {
      total: rawList.length,
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
    };
  }, [rawList]);

  // Filter items based on active view and inputs
  const filteredRows = useMemo(() => {
    return rawList.filter((row) => {
      // View mode condition
      if (viewMode === 'fleet') {
        // Fleet directory only shows approved / active drivers
        if (row.application.status !== 'APPROVED') return false;

        if (fleetFilter !== 'ALL') {
          const status = row.driver?.status ?? 'ACTIVE';
          if (status !== fleetFilter) return false;
        }
      } else {
        // KYC view mode
        if (kycFilter === 'PENDING') {
          if (!REVIEWABLE.has(row.application.status)) return false;
        } else if (kycFilter !== 'ALL') {
          if (row.application.status !== kycFilter) return false;
        }
      }

      // Vehicle category filter
      if (vehicleFilter !== 'ALL') {
        if (!row.vehicle || row.vehicle.vehicleType !== vehicleFilter) {
          return false;
        }
      }

      // Search query (phone, driverId, registrationNumber, make/model)
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.trim().toLowerCase();
        const phone = row.phoneE164?.toLowerCase() ?? '';
        const driverId = row.application.driverId.toLowerCase();
        const reg = row.vehicle?.registrationNumber.toLowerCase() ?? '';
        const makeModel = `${row.vehicle?.make ?? ''} ${row.vehicle?.model ?? ''}`.toLowerCase();

        const matches =
          phone.includes(q) ||
          driverId.includes(q) ||
          reg.includes(q) ||
          makeModel.includes(q);

        if (!matches) return false;
      }

      return true;
    });
  }, [rawList, viewMode, kycFilter, fleetFilter, vehicleFilter, searchQuery]);

  // Pagination slicing
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, page]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    vehicleFilter !== 'ALL' ||
    (viewMode === 'kyc' && kycFilter !== 'ALL') ||
    (viewMode === 'fleet' && fleetFilter !== 'ALL');

  const handleClearFilters = () => {
    setSearchQuery('');
    setVehicleFilter('ALL');
    setKycFilter('ALL');
    setFleetFilter('ALL');
    setPage(1);
  };

  // Columns for KYC Verification Queue
  const kycColumns: Column<DriverApplicationSummaryDto>[] = [
    {
      key: 'driver',
      header: 'Applicant',
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-full bg-surface-muted border border-border flex items-center justify-center shrink-0 text-text-subtle">
            <User className="size-4 text-interactive" />
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-sm font-semibold text-text">
              {r.phoneE164 ?? '—'}
            </span>
            <span className="font-mono text-[11px] text-text-subtle truncate max-w-[120px]" title={r.application.driverId}>
              {r.application.driverId.slice(0, 8)}…
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Application Status',
      render: (r) => (
        <div className="flex items-center gap-2">
          <StatusBadge status={r.application.status} />
          {r.application.reapplyCount > 0 && (
            <Badge tone="warning">Reapplied #{r.application.reapplyCount}</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'vehicle',
      header: 'Registered Vehicle',
      render: (r) =>
        r.vehicle === null ? (
          <span className="text-text-subtle text-xs italic">No vehicle submitted</span>
        ) : (
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <Badge tone="neutral" className="text-[10px] py-0 px-1.5">
                {r.vehicle.vehicleType}
              </Badge>
              <span className="text-xs font-medium text-text">
                {r.vehicle.make} {r.vehicle.model}
              </span>
            </div>
            <span className="font-mono text-xs text-text-subtle mt-0.5">
              {r.vehicle.registrationNumber}
            </span>
          </div>
        ),
    },
    {
      key: 'submitted',
      header: 'Submission',
      render: (r) => (
        <div className="flex flex-col">
          <span className="text-xs font-medium text-text">{formatDate(r.application.submittedAt)}</span>
          <span className="text-[11px] text-text-subtle flex items-center gap-1 mt-0.5">
            <Clock className="size-3" />
            {formatTimeAgo(r.application.submittedAt)}
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => {
        const needsReview = REVIEWABLE.has(r.application.status);
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Link
              href={`/drivers/applications/${r.application.id}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                size="sm"
                variant={needsReview ? 'primary' : 'secondary'}
              >
                {needsReview ? 'Review' : 'View'}
              </Button>
            </Link>
            <Link
              href={`/finance?driverId=${r.application.driverId}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Button size="sm" icon={<CreditCard className="size-3.5" />} aria-label="Wallet" title="View Wallet" />
            </Link>
            <Link
              href={`/rides?driverId=${r.application.driverId}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Button size="sm" icon={<Car className="size-3.5" />} aria-label="Rides" title="View Rides" />
            </Link>
          </div>
        );
      },
    },
  ];

  // Columns for Fleet Directory View
  const fleetColumns: Column<DriverApplicationSummaryDto>[] = [
    {
      key: 'driver',
      header: 'Driver',
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-600">
            <User className="size-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-sm font-semibold text-text">
              {r.phoneE164 ?? '—'}
            </span>
            <span className="font-mono text-[11px] text-text-subtle truncate max-w-[120px]" title={r.application.driverId}>
              {r.application.driverId.slice(0, 8)}…
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'operational',
      header: 'Operational State',
      render: () => <OperationalStatusBadge status="ONLINE" />,
    },
    {
      key: 'accountStatus',
      header: 'Account Status',
      render: (r) => <DriverStatusBadge status={r.driver?.status ?? 'ACTIVE'} />,
    },
    {
      key: 'vehicle',
      header: 'Assigned Vehicle',
      render: (r) =>
        r.vehicle === null ? (
          <span className="text-text-subtle text-xs italic">Unassigned</span>
        ) : (
          <div className="flex flex-col">
            <span className="text-xs font-medium text-text">
              {r.vehicle.make} {r.vehicle.model}
            </span>
            <span className="font-mono text-[11px] text-text-subtle">
              {r.vehicle.registrationNumber} · {r.vehicle.vehicleType}
            </span>
          </div>
        ),
    },
    {
      key: 'rating',
      header: 'Rating & Rides',
      render: (r) => (
        <div className="flex items-center gap-1.5 text-xs">
          <Star className="size-3.5 fill-amber-500 text-amber-500" />
          <span className="font-semibold text-text">
            {r.driver?.ratingAverage ? r.driver.ratingAverage.toFixed(2) : '5.0'}
          </span>
          <span className="text-text-subtle">
            ({r.driver?.ratingCount ?? 0})
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedFleetDriver(r);
            }}
          >
            Profile
          </Button>
          <Link
            href={`/finance?driverId=${r.application.driverId}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Button size="sm" icon={<CreditCard className="size-3.5" />} aria-label="Wallet" title="Driver Wallet" />
          </Link>
          <Link
            href={`/rides?driverId=${r.application.driverId}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Button size="sm" icon={<Car className="size-3.5" />} aria-label="Rides" title="Driver Rides" />
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-8 max-w-[1600px] mx-auto w-full">
      {/* Page Header */}
      <PageHeader
        title="Drivers & KYC Control Plane"
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Drivers & KYC' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              icon={<RefreshCw className={`size-4 ${appsQuery.isFetching ? 'animate-spin' : ''}`} />}
              loading={appsQuery.isFetching}
              onClick={() => void appsQuery.refetch()}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* Operational KPI Stat Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Pending KYC Reviews"
          value={stats.pending}
          icon={<Clock className="size-4 text-warning" />}
          hint="Applications awaiting admin action"
          tone={stats.pending > 0 ? 'warning' : 'default'}
          loading={appsQuery.isLoading}
        />
        <StatTile
          label="Active Fleet Drivers"
          value={stats.approved}
          icon={<CheckCircle2 className="size-4 text-success" />}
          hint="Onboarded & dispatch eligible"
          tone="success"
          loading={appsQuery.isLoading}
        />
        <StatTile
          label="Total Applications"
          value={stats.total}
          icon={<Users className="size-4 text-text-subtle" />}
          hint="Across all onboarding submissions"
          tone="default"
          loading={appsQuery.isLoading}
        />
        <StatTile
          label="Rejected / Fraud"
          value={stats.rejected}
          icon={<XCircle className="size-4 text-danger" />}
          hint="Fixable or permanent fraud blocks"
          tone={stats.rejected > 0 ? 'danger' : 'default'}
          loading={appsQuery.isLoading}
        />
      </div>

      {/* View Switcher: KYC Queue vs Fleet Directory */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <SegmentedControl<ViewMode>
          label="Drivers Console View"
          value={viewMode}
          onValueChange={(val) => {
            setViewMode(val);
            setPage(1);
          }}
          segments={[
            {
              value: 'kyc',
              label: `KYC Review Queue ${stats.pending > 0 ? `(${stats.pending})` : ''}`,
              icon: <FileCheck className="size-3.5" />,
            },
            {
              value: 'fleet',
              label: `Fleet Directory (${stats.approved})`,
              icon: <Users className="size-3.5" />,
            },
          ]}
        />
      </div>

      {/* Filter and Search Bar */}
      <FilterBar>
        <div className="flex-1 min-w-[240px]">
          <SearchInput
            value={searchQuery}
            onChange={(val) => {
              setSearchQuery(val);
              setPage(1);
            }}
            placeholder="Search phone, driver ID, plate number, vehicle make..."
          />
        </div>

        {viewMode === 'kyc' ? (
          <FilterField label="KYC Status" className="w-48">
            <Select
              value={kycFilter}
              onValueChange={(v) => {
                setKycFilter(v as KycFilter);
                setPage(1);
              }}
              options={KYC_FILTER_OPTIONS}
            />
          </FilterField>
        ) : (
          <FilterField label="Fleet Status" className="w-44">
            <Select
              value={fleetFilter}
              onValueChange={(v) => {
                setFleetFilter(v as FleetFilter);
                setPage(1);
              }}
              options={FLEET_FILTER_OPTIONS}
            />
          </FilterField>
        )}

        <FilterField label="Vehicle Type" className="w-44">
          <Select
            value={vehicleFilter}
            onValueChange={(v) => {
              setVehicleFilter(v);
              setPage(1);
            }}
            options={VEHICLE_FILTER_OPTIONS}
          />
        </FilterField>

        {hasActiveFilters && (
          <div className="pb-0.5">
            <Button size="sm" variant="secondary" onClick={handleClearFilters}>
              Clear Filters
            </Button>
          </div>
        )}
      </FilterBar>

      {/* Table & Data Representation */}
      {appsQuery.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-64 w-full rounded-md" />
        </div>
      ) : appsQuery.isError ? (
        <ErrorState
          message={
            appsQuery.error instanceof Error
              ? appsQuery.error.message
              : 'Could not load driver applications.'
          }
          onRetry={() => void appsQuery.refetch()}
        />
      ) : currentRows.length === 0 ? (
        <EmptyState
          title={
            hasActiveFilters
              ? 'No matching drivers or applications'
              : viewMode === 'kyc'
                ? 'No pending applications'
                : 'No approved drivers in fleet'
          }
          description={
            hasActiveFilters
              ? 'Try adjusting your search criteria or clearing active filters.'
              : viewMode === 'kyc'
                ? 'All driver KYC applications have been reviewed.'
                : 'Approved drivers will appear in this directory.'
          }
          action={
            hasActiveFilters ? (
              <Button onClick={handleClearFilters}>Reset Filters</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <DataTable
            columns={viewMode === 'kyc' ? kycColumns : fleetColumns}
            rows={currentRows}
            rowKey={(r) => r.application.id}
            onRowClick={(r) => {
              if (viewMode === 'kyc') {
                router.push(`/drivers/applications/${r.application.id}`);
              } else {
                setSelectedFleetDriver(r);
              }
            }}
            refetching={appsQuery.isFetching}
          />

          <Pagination
            page={page}
            pageCount={pageCount}
            total={filteredRows.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Fleet Driver Profile Modal */}
      <DriverDetailModal
        driverSummary={selectedFleetDriver}
        open={selectedFleetDriver !== null}
        onOpenChange={(open) => !open && setSelectedFleetDriver(null)}
      />
    </div>
  );
}
