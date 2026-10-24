'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Car,
  CheckCircle2,
  Clock,
  CreditCard,
  MapPin,
  Phone,
  RefreshCw,
  Star,
  UserCheck,
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
  IconButton,
  PageHeader,
  Pagination,
  SearchInput,
  SegmentedControl,
  Select,
  Skeleton,
  StatTile,
} from '@cabzone/design-system';
import { VEHICLE_CATEGORIES } from '@cabzone/contracts';
import type { DriverApplicationSummaryDto } from '@/lib/api/endpoints/drivers';
import { useDriverApplications } from '../hooks/useDriverApplications';
import { DriverDetailModal } from './DriverDetailModal';
import {
  DriverStatusBadge,
  REVIEWABLE,
  StatusBadge,
} from './StatusBadge';

const PAGE_SIZE = 15;

type ViewMode = 'fleet' | 'kyc';
type FleetFilter = 'ALL' | 'ACTIVE' | 'SUSPENDED';

const FLEET_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All Verified Drivers' },
  { value: 'ACTIVE', label: 'Active Drivers' },
  { value: 'SUSPENDED', label: 'Suspended Drivers' },
];

const VEHICLE_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All Vehicle Types' },
  ...VEHICLE_CATEGORIES.map((c) => ({ value: c, label: c.replaceAll('_', ' ') })),
];

const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return 'Not available';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatTime = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d
    .toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
    .toLowerCase();
};

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

const formatPhoneDisplay = (phoneE164: string | null): string => {
  if (!phoneE164) return '—';
  const cleaned = phoneE164.replace(/\s+/g, '');
  const match = cleaned.match(/^(\+91)(\d{5})(\d{5})$/);
  if (match) {
    return `${match[1]} ${match[2]} ${match[3]}`;
  }
  return phoneE164;
};

const getDriverInitials = (name: string | null | undefined, phone: string | null): string => {
  const trimmed = name?.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  }
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.slice(-2) || 'DR';
};

type IndexedDriverRow = DriverApplicationSummaryDto & { sl: number };

export function DriversScreen() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('fleet');
  const [searchQuery, setSearchQuery] = useState('');
  const [fleetFilter, setFleetFilter] = useState<FleetFilter>('ALL');
  const [vehicleFilter, setVehicleFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);

  // Selected fleet profile modal
  const [selectedFleetDriver, setSelectedFleetDriver] =
    useState<DriverApplicationSummaryDto | null>(null);

  // Fetch all applications to power both KPI stats, the review queue, and verified drivers
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
        // Verified drivers only shows approved / active drivers
        if (row.application.status !== 'APPROVED') return false;

        if (fleetFilter !== 'ALL') {
          const status = row.driver?.status ?? 'ACTIVE';
          if (status !== fleetFilter) return false;
        }

        // Vehicle category filter (only in Verified Drivers view)
        if (vehicleFilter !== 'ALL') {
          if (!row.vehicle || row.vehicle.vehicleType !== vehicleFilter) {
            return false;
          }
        }
      } else {
        // Requests / Pending view only shows pending applications awaiting review
        if (!REVIEWABLE.has(row.application.status)) return false;
      }

      // Search query (name, phone, DL, address, driverId, registrationNumber, make/model)
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.trim().toLowerCase();
        const name = row.driver?.name?.toLowerCase() ?? '';
        const phone = row.phoneE164?.toLowerCase() ?? '';
        const phoneFormatted = formatPhoneDisplay(row.phoneE164).toLowerCase();
        const dl = row.driver?.dlNumber?.toLowerCase() ?? '';
        const address = row.driver?.address?.toLowerCase() ?? '';
        const driverId = row.application.driverId.toLowerCase();
        const reg = row.vehicle?.registrationNumber.toLowerCase() ?? '';
        const makeModel = `${row.vehicle?.make ?? ''} ${row.vehicle?.model ?? ''}`.toLowerCase();

        const matches =
          name.includes(q) ||
          phone.includes(q) ||
          phoneFormatted.includes(q) ||
          dl.includes(q) ||
          address.includes(q) ||
          driverId.includes(q) ||
          reg.includes(q) ||
          makeModel.includes(q);

        if (!matches) return false;
      }

      return true;
    });
  }, [rawList, viewMode, fleetFilter, vehicleFilter, searchQuery]);

  // Pagination slicing with SL number
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentRows = useMemo<IndexedDriverRow[]>(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE).map((r, idx) => ({
      ...r,
      sl: start + idx + 1,
    }));
  }, [filteredRows, page]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    (viewMode === 'fleet' && (vehicleFilter !== 'ALL' || fleetFilter !== 'ALL'));

  const handleClearFilters = () => {
    setSearchQuery('');
    setVehicleFilter('ALL');
    setFleetFilter('ALL');
    setPage(1);
  };

  // Columns for Requests / Pending Queue
  const kycColumns: Column<IndexedDriverRow>[] = [
    {
      key: 'sl',
      header: 'SL',
      render: (r) => <span className="text-xs font-medium text-text-subtle">{r.sl}</span>,
    },
    {
      key: 'driver',
      header: 'Driver',
      render: (r) => {
        const driverName = r.driver?.name?.trim() || 'Unnamed Driver';
        const dlNumber = r.driver?.dlNumber?.trim() || 'No DL Number';
        const initials = getDriverInitials(r.driver?.name, r.phoneE164);
        return (
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-full bg-surface-muted border border-border flex items-center justify-center shrink-0 text-xs font-bold text-text">
              {initials}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-text leading-snug">{driverName}</span>
              <span className="text-xs text-text-subtle">{dlNumber}</span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'mobile',
      header: 'Mobile',
      render: (r) => (
        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-text">
          <Phone className="size-3.5 text-text-subtle shrink-0" />
          <span>{formatPhoneDisplay(r.phoneE164)}</span>
        </div>
      ),
    },
    {
      key: 'submitted',
      header: 'Submitted Date ↓',
      render: (r) => (
        <div className="flex flex-col">
          <span className="text-xs font-medium text-text">
            {formatDate(r.application.submittedAt ?? r.application.createdAt)}
          </span>
          <span className="text-[11px] text-text-subtle flex items-center gap-1 mt-0.5">
            <Clock className="size-3" />
            {formatTimeAgo(r.application.submittedAt)}
          </span>
        </div>
      ),
    },
    {
      key: 'address',
      header: 'Address',
      render: (r) =>
        r.driver?.address ? (
          <div className="inline-flex items-center gap-1.5 text-xs text-text">
            <MapPin className="size-3.5 text-text-subtle shrink-0" />
            <span className="truncate max-w-[160px]" title={r.driver.address}>
              {r.driver.address}
            </span>
          </div>
        ) : (
          <span className="text-xs text-text-subtle">Not available</span>
        ),
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
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
      key: 'status',
      header: 'Status',
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
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (r) => {
        const needsReview = REVIEWABLE.has(r.application.status);
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Link
              href={`/drivers/applications/${r.application.id}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Button size="sm" variant={needsReview ? 'primary' : 'secondary'}>
                {needsReview ? 'Review' : 'View'}
              </Button>
            </Link>
            <Link
              href={`/finance?driverId=${r.application.driverId}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                size="sm"
                icon={<CreditCard className="size-3.5" />}
                aria-label="Wallet"
                title="View Wallet"
              />
            </Link>
            <Link
              href={`/rides?driverId=${r.application.driverId}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                size="sm"
                icon={<Car className="size-3.5" />}
                aria-label="Rides"
                title="View Rides"
              />
            </Link>
          </div>
        );
      },
    },
  ];

  // Columns for Verified Drivers View (matching inspiration columns)
  const fleetColumns: Column<IndexedDriverRow>[] = [
    {
      key: 'sl',
      header: 'SL',
      render: (r) => <span className="text-xs font-medium text-text-subtle">{r.sl}</span>,
    },
    {
      key: 'driver',
      header: 'Driver',
      render: (r) => {
        const driverName = r.driver?.name?.trim() || 'Unnamed Driver';
        const dlNumber = r.driver?.dlNumber?.trim() || 'No DL Number';
        const initials = getDriverInitials(r.driver?.name, r.phoneE164);
        return (
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-full bg-surface-muted border border-border flex items-center justify-center shrink-0 text-xs font-bold text-text">
              {initials}
            </div>
            <div className="flex flex-col">
              <Link
                href={`/drivers/${r.application.id}`}
                className="text-sm font-semibold text-text hover:text-interactive hover:underline leading-snug"
                onClick={(e) => e.stopPropagation()}
              >
                {driverName}
              </Link>
              <span className="text-xs text-text-subtle">{dlNumber}</span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'mobile',
      header: 'Mobile',
      render: (r) => (
        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-text">
          <Phone className="size-3.5 text-text-subtle shrink-0" />
          <span>{formatPhoneDisplay(r.phoneE164)}</span>
        </div>
      ),
    },
    {
      key: 'joinedDate',
      header: 'Joined Date ↓',
      render: (r) => (
        <span className="text-xs text-text-subtle">
          {formatDate(r.application.reviewedAt ?? r.application.createdAt)}
        </span>
      ),
    },
    {
      key: 'address',
      header: 'Address',
      render: (r) =>
        r.driver?.address ? (
          <div className="inline-flex items-center gap-1.5 text-xs text-text">
            <MapPin className="size-3.5 text-text-subtle shrink-0" />
            <span className="truncate max-w-[160px]" title={r.driver.address}>
              {r.driver.address}
            </span>
          </div>
        ) : (
          <span className="text-xs text-text-subtle">Not available</span>
        ),
    },
    {
      key: 'licenseExpiry',
      header: 'License Expiry',
      render: (r) => (
        <span className="text-xs text-text-subtle">{formatDate(r.driver?.dlExpiry)}</span>
      ),
    },
    {
      key: 'lastRide',
      header: 'Last Ride',
      render: (r) => {
        const lastIso = r.application.reviewedAt ?? r.application.submittedAt;
        if (!lastIso) {
          return <span className="text-xs text-text-subtle">Not available</span>;
        }
        return (
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-semibold text-text">{formatDate(lastIso)}</span>
            <span className="text-[11px] text-text-subtle mt-0.5">{formatTime(lastIso)}</span>
          </div>
        );
      },
    },
    {
      key: 'rating',
      header: 'Rating',
      render: (r) => {
        const ratingVal = r.driver?.ratingAverage ? r.driver.ratingAverage.toFixed(1) : '5.0';
        const tripCount = r.driver?.ratingCount ?? 0;
        return (
          <div className="flex flex-col leading-tight">
            <div className="inline-flex items-center gap-1 text-xs">
              <Star className="size-3.5 fill-amber-500 text-amber-500" />
              <span className="font-semibold text-text">{ratingVal}</span>
            </div>
            <span className="text-[11px] text-text-subtle mt-0.5">
              ({tripCount} {tripCount === 1 ? 'trip' : 'trips'})
            </span>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <DriverStatusBadge status={r.driver?.status ?? 'ACTIVE'} />,
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <Link href={`/drivers/${r.application.id}`} onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="secondary">
              View
            </Button>
          </Link>
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedFleetDriver(r);
            }}
          >
            Edit
          </Button>
          <Link
            href={`/drivers/${r.application.id}?tab=financials`}
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton
              size="sm"
              variant="secondary"
              icon={<CreditCard className="size-3.5" />}
              label="Driver Financials"
              title="Driver Financials"
            />
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-8 max-w-[1600px] mx-auto w-full">
      {/* Page Header */}
      <PageHeader
        title="Drivers"
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Drivers' }]}
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
          label="Verified Drivers"
          value={stats.approved}
          icon={<CheckCircle2 className="size-4 text-success" />}
          hint="Onboarded & dispatch eligible"
          tone="success"
          loading={appsQuery.isLoading}
        />
        <StatTile
          label="Requests / Pending"
          value={stats.pending}
          icon={<Clock className="size-4 text-warning" />}
          hint="Applications awaiting admin action"
          tone={stats.pending > 0 ? 'warning' : 'default'}
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

      {/* View Switcher: Verified Drivers (default) vs Requests / Pending */}
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
              value: 'fleet',
              label: `Verified Drivers (${stats.approved})`,
              icon: <UserCheck className="size-3.5" />,
            },
            {
              value: 'kyc',
              label: `Requests / Pending ${stats.pending > 0 ? `(${stats.pending})` : ''}`,
              icon: <Clock className="size-3.5" />,
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
            placeholder="Search by name or phone..."
          />
        </div>

        {viewMode === 'fleet' && (
          <>
            <FilterField label="Driver Status" className="w-44">
              <Select
                value={fleetFilter}
                onValueChange={(v) => {
                  setFleetFilter(v as FleetFilter);
                  setPage(1);
                }}
                options={FLEET_FILTER_OPTIONS}
              />
            </FilterField>

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
          </>
        )}

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
                ? 'No pending requests'
                : 'No verified drivers yet'
          }
          description={
            hasActiveFilters
              ? 'Try adjusting your search criteria or clearing active filters.'
              : viewMode === 'kyc'
                ? 'All driver applications have been reviewed.'
                : 'Verified drivers will appear in this list.'
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
