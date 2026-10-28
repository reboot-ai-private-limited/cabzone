'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Car,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Edit2,
  RefreshCw,
  Shield,
  Star,
  User,
  UserCheck,
  Users,
  UserX,
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
import {
  MIN_PUBLIC_RATING_COUNT,
  formatPublicRatingLabel,
  type AdminRiderSummaryDto,
  type UserStatus,
} from '@cabzone/contracts';
import { useRidersList } from '../hooks/useRiders';
import { RiderStatusBadge } from './RiderStatusBadge';
import { RiderDetailModal } from './RiderDetailModal';
import { RiderStatusDialog } from './RiderStatusDialog';
import { RiderEditDialog } from './RiderEditDialog';
import { TrustScoreBadge } from '../../identity/components/TrustScoreBadge';

const PAGE_SIZE = 15;

type SegmentView = 'ALL' | 'ACTIVE' | 'SUSPENDED';
type SortOption = 'NEWEST' | 'OLDEST' | 'RATING_DESC' | 'TRIPS_DESC' | 'NAME_ASC';

const SORT_OPTIONS = [
  { value: 'NEWEST', label: 'Joined: Newest First' },
  { value: 'OLDEST', label: 'Joined: Oldest First' },
  { value: 'RATING_DESC', label: 'Rating: Highest First' },
  { value: 'TRIPS_DESC', label: 'Bookings: Most First' },
  { value: 'NAME_ASC', label: 'Name: A to Z' },
];

const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
};

const formatTimeAgo = (iso: string | null): string => {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / (1000 * 60));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
};

const formatPhone = (phone: string | null): string => {
  if (!phone) return '—';
  if (phone.startsWith('+91') && phone.length === 13) {
    return `+91 ${phone.slice(3, 8)} ${phone.slice(8)}`;
  }
  return phone;
};

function CopyPhoneButton({ phone }: { phone: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'Copied phone number' : `Copy ${phone}`}
      className="p-1.5 rounded-md text-text-subtle hover:text-text hover:bg-surface-muted transition-colors shrink-0"
      aria-label={`Copy phone ${phone}`}
    >
      {copied ? (
        <Check className="size-3.5 text-emerald-600" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </button>
  );
}

export function RidersScreen() {
  const [segmentView, setSegmentView] = useState<SegmentView>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('NEWEST');
  const [page, setPage] = useState(1);

  // Selected modals
  const [selectedRider, setSelectedRider] = useState<AdminRiderSummaryDto | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const [statusTargetRider, setStatusTargetRider] = useState<AdminRiderSummaryDto | null>(null);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);

  const [editTargetRider, setEditTargetRider] = useState<AdminRiderSummaryDto | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Query for KPI aggregates from live API (never supplemented with fabricated sample records)
  const allQuery = useRidersList({ limit: 100 });

  // Map segment to backend UserStatus when possible
  const apiStatusParam: UserStatus | undefined =
    segmentView === 'ACTIVE' ? 'ACTIVE' : segmentView === 'SUSPENDED' ? 'SUSPENDED' : undefined;

  // Paginated and filtered query from live API
  const query = useRidersList({
    search: searchQuery.trim() || undefined,
    status: apiStatusParam,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const allRidersPool = useMemo(() => allQuery.data?.riders ?? [], [allQuery.data?.riders]);

  // Honest KPI Stats computed strictly from live server records
  const kpis = useMemo(() => {
    if (allQuery.isError || !allQuery.data) {
      return {
        total: null as number | null,
        active: null as number | null,
        suspended: null as number | null,
        avgRating: '—',
      };
    }

    let active = 0;
    let suspended = 0;
    let ratingSum = 0;
    let ratingCount = 0;

    for (const r of allRidersPool) {
      if (r.status === 'ACTIVE') active++;
      if (r.status === 'SUSPENDED') suspended++;
      if (r.ratingCount >= MIN_PUBLIC_RATING_COUNT && r.ratingAverage !== null) {
        ratingSum += r.ratingAverage;
        ratingCount++;
      }
    }

    const avgRating = ratingCount > 0 ? (ratingSum / ratingCount).toFixed(1) : '—';
    return {
      total: allQuery.data.total,
      active,
      suspended,
      avgRating,
    };
  }, [allQuery.data, allQuery.isError, allRidersPool]);

  const { currentRows, totalCount, pageCount } = useMemo(() => {
    const serverRows = query.data?.riders ?? [];
    const total = query.data?.total ?? 0;
    const sorted = [...serverRows].sort((a, b) => {
      switch (sortOption) {
        case 'OLDEST':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'RATING_DESC':
          return (b.ratingAverage ?? -1) - (a.ratingAverage ?? -1);
        case 'TRIPS_DESC':
          return b.totalRides - a.totalRides;
        case 'NAME_ASC':
          return (a.name ?? '').localeCompare(b.name ?? '');
        case 'NEWEST':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return {
      currentRows: sorted,
      totalCount: total,
      pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  }, [query.data, sortOption]);

  const handleOpenDetail = (rider: AdminRiderSummaryDto) => {
    setSelectedRider(rider);
    setIsDetailOpen(true);
  };

  const handleOpenStatus = (rider: AdminRiderSummaryDto, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setStatusTargetRider(rider);
    setIsStatusDialogOpen(true);
  };

  const handleOpenEdit = (rider: AdminRiderSummaryDto, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditTargetRider(rider);
    setIsEditDialogOpen(true);
  };

  const hasActiveFilters =
    searchQuery.trim().length > 0 || sortOption !== 'NEWEST' || segmentView !== 'ALL';

  const handleClearFilters = () => {
    setSearchQuery('');
    setSortOption('NEWEST');
    setSegmentView('ALL');
    setPage(1);
  };

  const columns: Column<AdminRiderSummaryDto>[] = [
    {
      key: 'name',
      header: 'Customer Name',
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-interactive/10 text-interactive border border-interactive/20 flex items-center justify-center shrink-0 font-bold text-sm shadow-sm">
            {r.name ? (
              r.name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()
            ) : (
              <User className="size-5 text-interactive" />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-text truncate">
              {r.name || 'Unnamed Customer'}
            </span>
            <span className="text-xs text-text-subtle truncate max-w-[200px] mt-0.5">
              {r.email || 'No email registered'}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'number',
      header: 'Phone Number',
      render: (r) => (
        <div className="flex items-center gap-2 whitespace-nowrap">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="font-mono text-sm font-semibold text-text tracking-wide whitespace-nowrap">
                {formatPhone(r.phoneE164)}
              </span>
              <CopyPhoneButton phone={r.phoneE164} />
            </div>
            <span className="text-[11px] text-text-subtle flex items-center gap-1 mt-0.5 whitespace-nowrap">
              <Shield className="size-3 text-text-subtle shrink-0" />
              <span>{r.emergencyContact ? 'Safety Contact Set' : 'No SOS Contact'}</span>
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Account Status',
      render: (r) => (
        <div className="flex flex-col gap-0.5 whitespace-nowrap">
          <div>
            <RiderStatusBadge status={r.status} />
          </div>
          <span className="text-[11px] text-text-subtle mt-0.5 whitespace-nowrap">
            {r.status === 'ACTIVE' ? 'Active Dispatch' : 'Login Revoked'}
          </span>
        </div>
      ),
    },
    {
      key: 'rating',
      header: 'Rating & Reviews',
      render: (r) => (
        <div className="flex flex-col gap-0.5 whitespace-nowrap">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="font-semibold text-sm text-text flex items-center gap-1">
              <Star className="size-3.5 fill-amber-400 text-amber-500 shrink-0" />
              {formatPublicRatingLabel(r.ratingAverage, r.ratingCount)}
            </span>
            <span className="text-xs text-text-subtle whitespace-nowrap">
              ({r.ratingCount} {r.ratingCount === 1 ? 'review' : 'reviews'})
            </span>
          </div>
          <span className="text-[11px] text-text-subtle whitespace-nowrap">
            {r.ratingCount >= MIN_PUBLIC_RATING_COUNT &&
            r.ratingAverage !== null &&
            r.ratingAverage >= 4.8
              ? 'Top Customer'
              : r.ratingCount >= MIN_PUBLIC_RATING_COUNT &&
                  r.ratingAverage !== null &&
                  r.ratingAverage < 4.0
                ? 'Needs Attention'
                : r.ratingCount >= MIN_PUBLIC_RATING_COUNT && r.ratingAverage !== null
                  ? 'Good Standing'
                  : 'New Account'}
          </span>
        </div>
      ),
    },
    {
      key: 'trustScore',
      header: 'Trust Score',
      render: (r) => (
        <TrustScoreBadge
          score={r.trustScore}
          tier={r.trustScoreBreakdown?.tier}
          size="sm"
        />
      ),
    },
    {
      key: 'bookings',
      header: 'Bookings & Trips',
      render: (r) => (
        <div className="flex flex-col gap-0.5 whitespace-nowrap">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="font-semibold text-sm text-text">
              {r.totalRides} {r.totalRides === 1 ? 'Booking' : 'Bookings'}
            </span>
            {r.completedRides > 0 && (
              <Badge tone="neutral" className="text-[10px] py-0 px-1.5 font-mono">
                {r.completedRides} Done
              </Badge>
            )}
          </div>
          <span className="text-xs text-text-subtle mt-0.5 whitespace-nowrap">
            {r.completedRides} completed of {r.totalRides} requested
          </span>
        </div>
      ),
    },
    {
      key: 'joinedDate',
      header: 'Joined Date',
      render: (r) => (
        <div className="flex flex-col gap-0.5 whitespace-nowrap">
          <span className="text-sm font-medium text-text flex items-center gap-1.5 whitespace-nowrap">
            <Calendar className="size-3.5 text-text-subtle shrink-0" />
            {formatDate(r.createdAt)}
          </span>
          <span className="text-xs text-text-subtle flex items-center gap-1 mt-0.5 whitespace-nowrap">
            <Clock className="size-3 text-text-subtle shrink-0" />
            {formatTimeAgo(r.createdAt)}
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenDetail(r);
            }}
          >
            Profile
          </Button>

          <Link
            href={`/rides?riderId=${r.id}`}
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton
              size="sm"
              variant="secondary"
              icon={<Car className="size-3.5 text-text-subtle" />}
              label="Customer Rides"
              title="Customer Rides"
            />
          </Link>

          <IconButton
            size="sm"
            variant="secondary"
            onClick={(e) => handleOpenEdit(r, e)}
            icon={<Edit2 className="size-3.5 text-text-subtle" />}
            label="Edit Profile"
            title="Edit Customer Profile"
          />

          <IconButton
            size="sm"
            variant="secondary"
            onClick={(e) => handleOpenStatus(r, e)}
            icon={
              r.status === 'SUSPENDED' ? (
                <UserCheck className="size-3.5 text-success" />
              ) : (
                <UserX className="size-3.5 text-text-subtle hover:text-danger" />
              )
            }
            label={r.status === 'SUSPENDED' ? 'Reactivate Customer' : 'Suspend Customer'}
            title={r.status === 'SUSPENDED' ? 'Reactivate Customer' : 'Suspend Customer'}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8 w-full max-w-full">
      {/* Page Header */}
      <PageHeader
        title="Customers"
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Customers' }]}
        actions={
          <div className="flex items-center gap-2">
            {kpis.total !== null && (
              <Badge tone="neutral" className="text-xs py-1 px-2.5 font-medium">
                {kpis.total} Total Customers
              </Badge>
            )}
            <Button
              icon={<RefreshCw className={`size-4 ${query.isFetching ? 'animate-spin' : ''}`} />}
              loading={query.isFetching}
              onClick={() => {
                void query.refetch();
                void allQuery.refetch();
              }}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* Operational KPI Stat Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Total Customers"
          value={kpis.total ?? '—'}
          icon={<Users className="size-4 text-interactive" />}
          hint="Registered mobile accounts"
          tone="default"
          loading={allQuery.isPending}
        />
        <StatTile
          label="Active Accounts"
          value={kpis.active ?? '—'}
          icon={<CheckCircle2 className="size-4 text-success" />}
          hint="Eligible to book rides"
          tone="success"
          loading={allQuery.isPending}
        />
        <StatTile
          label="Suspended Accounts"
          value={kpis.suspended ?? '—'}
          icon={<XCircle className="size-4 text-danger" />}
          hint="Access revoked by operations"
          tone={(kpis.suspended ?? 0) > 0 ? 'danger' : 'default'}
          loading={allQuery.isPending}
        />
        <StatTile
          label="Average Customer Rating"
          value={kpis.avgRating !== '—' ? `${kpis.avgRating} ★` : '—'}
          icon={<Star className="size-4 text-amber-500 fill-amber-400" />}
          hint="Revealed ratings (5+ reviews)"
          tone="warning"
          loading={allQuery.isPending}
        />
      </div>

      {/* View Switcher Bar */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <SegmentedControl<SegmentView>
          label="Account Status"
          value={segmentView}
          onValueChange={(val) => {
            setSegmentView(val);
            setPage(1);
          }}
          segments={[
            {
              value: 'ALL',
              label: kpis.total !== null ? `All (${kpis.total})` : 'All',
              icon: <Users className="size-3.5" />,
            },
            {
              value: 'ACTIVE',
              label: kpis.active !== null ? `Active (${kpis.active})` : 'Active',
              icon: <UserCheck className="size-3.5 text-success" />,
            },
            {
              value: 'SUSPENDED',
              label: kpis.suspended !== null ? `Suspended (${kpis.suspended})` : 'Suspended',
              icon: <UserX className="size-3.5 text-danger" />,
            },
          ]}
        />
      </div>

      {/* Filter and Search Bar */}
      <FilterBar>
        <div className="flex-1 min-w-[280px]">
          <SearchInput
            value={searchQuery}
            onChange={(val) => {
              setSearchQuery(val);
              setPage(1);
            }}
            placeholder="Search by name, phone (+91...), or email"
          />
        </div>

        <FilterField label="Sort Directory By" className="w-56">
          <Select
            value={sortOption}
            onValueChange={(v) => {
              setSortOption(v as SortOption);
              setPage(1);
            }}
            options={SORT_OPTIONS}
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
      {query.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-64 w-full rounded-md" />
        </div>
      ) : query.isError ? (
        <ErrorState
          title="Failed to load customer list"
          message={
            query.error instanceof Error
              ? query.error.message
              : 'Could not connect to identity service. Please verify your connection and permissions.'
          }
          onRetry={() => void query.refetch()}
        />
      ) : currentRows.length === 0 ? (
        <EmptyState
          title={
            hasActiveFilters
              ? 'No matching customer accounts'
              : 'No customers registered yet'
          }
          description={
            hasActiveFilters
              ? 'Try adjusting your search criteria or clearing active filters.'
              : 'Customer accounts will appear in this directory upon registration.'
          }
          action={
            hasActiveFilters ? (
              <Button onClick={handleClearFilters}>Reset Filters</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <DataTable<AdminRiderSummaryDto>
            columns={columns}
            rows={currentRows}
            rowKey={(r) => r.id}
            onRowClick={(r) => handleOpenDetail(r)}
            refetching={query.isFetching}
            density="comfortable"
          />

          <Pagination
            page={page}
            pageCount={pageCount}
            total={totalCount}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Modals and Dialogs */}
      <RiderDetailModal
        riderId={selectedRider?.id ?? null}
        initialRider={selectedRider}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onRefresh={() => {
          void query.refetch();
          void allQuery.refetch();
        }}
      />

      <RiderStatusDialog
        rider={statusTargetRider}
        open={isStatusDialogOpen}
        onOpenChange={setIsStatusDialogOpen}
        onSuccess={() => {
          void query.refetch();
          void allQuery.refetch();
        }}
      />

      <RiderEditDialog
        rider={editTargetRider}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSuccess={() => {
          void query.refetch();
          void allQuery.refetch();
        }}
      />
    </div>
  );
}
