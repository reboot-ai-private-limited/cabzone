'use client';

import { useMemo, useState } from 'react';
import {
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Edit2,
  Globe,
  Headphones,
  KeyRound,
  Phone,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  Wallet,
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
  StatTile,
} from '@cabzone/design-system';
import type { AdminRole, AdminStatus, AdminUserSummaryDto } from '@cabzone/contracts';
import { useAdminsList } from '../hooks/useAdmins';
import { AdminRoleBadge } from './AdminRoleBadge';
import { AdminStatusBadge } from './AdminStatusBadge';
import { AdminDetailModal } from './AdminDetailModal';
import { AdminCreateDialog } from './AdminCreateDialog';
import { AdminEditDialog } from './AdminEditDialog';
import { AdminStatusDialog } from './AdminStatusDialog';
import { RolePermissionsMatrixModal } from './RolePermissionsMatrixModal';

const PAGE_SIZE = 15;

type SegmentView = 'ALL' | 'SUPER_ADMIN' | 'CITY_ADMIN' | 'SUPPORT_ADMIN' | 'FINANCE_ADMIN' | 'SUSPENDED';

const ROLE_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All Roles' },
  { value: 'SUPER_ADMIN', label: 'Super Administrators' },
  { value: 'CITY_ADMIN', label: 'City Administrators' },
  { value: 'SUPPORT_ADMIN', label: 'Support Specialists' },
  { value: 'FINANCE_ADMIN', label: 'Finance Managers' },
];

const STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All Account Statuses' },
  { value: 'ACTIVE', label: 'Active Only' },
  { value: 'SUSPENDED', label: 'Suspended Only' },
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
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      title="Copy Mobile Phone"
      aria-label="Copy phone"
    >
      {copied ? (
        <Check className="size-3 text-success animate-in zoom-in-50 duration-200" />
      ) : (
        <Copy className="size-3" />
      )}
    </button>
  );
}

const FILLER_ADMINS: AdminUserSummaryDto[] = [
  {
    id: '01920000-0000-7000-8000-000000000001',
    userId: '018f0a00-0000-7000-8000-000000000001',
    phoneE164: '+919811122233',
    name: 'Vikramaditya Sharma',
    email: 'vikram.hq@cabzone.in',
    role: 'SUPER_ADMIN',
    cityZoneIds: [],
    status: 'ACTIVE',
    createdAt: '2025-01-10T08:00:00.000Z',
    updatedAt: '2026-03-20T12:00:00.000Z',
  },
  {
    id: '01920000-0000-7000-8000-000000000002',
    userId: '018f0a00-0000-7000-8000-000000000002',
    phoneE164: '+919830011223',
    name: 'Ananya Sengupta',
    email: 'ananya.kolkata@cabzone.in',
    role: 'CITY_ADMIN',
    cityZoneIds: ['zone-kolkata-central', 'zone-howrah-station'],
    status: 'ACTIVE',
    createdAt: '2025-02-15T09:30:00.000Z',
    updatedAt: '2026-03-18T10:15:00.000Z',
  },
  {
    id: '01920000-0000-7000-8000-000000000003',
    userId: '018f0a00-0000-7000-8000-000000000003',
    phoneE164: '+919934055667',
    name: 'Rajeshwar Verma',
    email: 'rajeshwar.patna@cabzone.in',
    role: 'CITY_ADMIN',
    cityZoneIds: ['zone-patna-airport', 'zone-danapur-hub'],
    status: 'ACTIVE',
    createdAt: '2025-03-01T11:00:00.000Z',
    updatedAt: '2026-03-25T14:40:00.000Z',
  },
  {
    id: '01920000-0000-7000-8000-000000000004',
    userId: '018f0a00-0000-7000-8000-000000000004',
    phoneE164: '+919820099887',
    name: 'Preeti Kulkarni',
    email: 'preeti.finance@cabzone.in',
    role: 'FINANCE_ADMIN',
    cityZoneIds: [],
    status: 'ACTIVE',
    createdAt: '2025-03-15T10:00:00.000Z',
    updatedAt: '2026-04-01T09:00:00.000Z',
  },
  {
    id: '01920000-0000-7000-8000-000000000005',
    userId: '018f0a00-0000-7000-8000-000000000005',
    phoneE164: '+919450033445',
    name: 'Amit Tripathi',
    email: 'amit.varanasi@cabzone.in',
    role: 'CITY_ADMIN',
    cityZoneIds: ['zone-varanasi-ghats', 'zone-cantonment'],
    status: 'ACTIVE',
    createdAt: '2025-04-20T14:20:00.000Z',
    updatedAt: '2026-03-22T16:10:00.000Z',
  },
  {
    id: '01920000-0000-7000-8000-000000000006',
    userId: '018f0a00-0000-7000-8000-000000000006',
    phoneE164: '+919701144556',
    name: 'Sneha Reddy',
    email: 'sneha.support@cabzone.in',
    role: 'SUPPORT_ADMIN',
    cityZoneIds: [],
    status: 'ACTIVE',
    createdAt: '2025-06-05T09:15:00.000Z',
    updatedAt: '2026-03-29T11:30:00.000Z',
  },
  {
    id: '01920000-0000-7000-8000-000000000007',
    userId: '018f0a00-0000-7000-8000-000000000007',
    phoneE164: '+919845077889',
    name: 'Harish Gowda',
    email: 'harish.blr@cabzone.in',
    role: 'CITY_ADMIN',
    cityZoneIds: ['zone-whitefield', 'zone-electronic-city'],
    status: 'ACTIVE',
    createdAt: '2025-07-12T15:00:00.000Z',
    updatedAt: '2026-03-15T18:00:00.000Z',
  },
  {
    id: '01920000-0000-7000-8000-000000000008',
    userId: '018f0a00-0000-7000-8000-000000000008',
    phoneE164: '+919899066778',
    name: 'Manoj Pandey',
    email: 'manoj.pandey@cabzone.in',
    role: 'SUPPORT_ADMIN',
    cityZoneIds: [],
    status: 'SUSPENDED',
    createdAt: '2025-05-18T10:45:00.000Z',
    updatedAt: '2026-02-14T08:30:00.000Z',
  },
];

export function AdminsScreen() {
  const [segmentView, setSegmentView] = useState<SegmentView>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  // Modals & Dialogs
  const [selectedAdmin, setSelectedAdmin] = useState<AdminUserSummaryDto | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isMatrixOpen, setIsMatrixOpen] = useState(false);

  const [editTargetAdmin, setEditTargetAdmin] = useState<AdminUserSummaryDto | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const [statusTargetAdmin, setStatusTargetAdmin] = useState<AdminUserSummaryDto | null>(null);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);

  // Query for KPI counts
  const allQuery = useAdminsList({ limit: 100 });

  // Map segment to backend role/status
  const apiRoleParam: AdminRole | undefined =
    roleFilter !== 'ALL'
      ? (roleFilter as AdminRole)
      : segmentView === 'SUPER_ADMIN' ||
          segmentView === 'CITY_ADMIN' ||
          segmentView === 'SUPPORT_ADMIN' ||
          segmentView === 'FINANCE_ADMIN'
        ? (segmentView as AdminRole)
        : undefined;

  const apiStatusParam: AdminStatus | undefined =
    statusFilter !== 'ALL'
      ? (statusFilter as AdminStatus)
      : segmentView === 'SUSPENDED'
        ? 'SUSPENDED'
        : undefined;

  // Paginated query
  const query = useAdminsList({
    search: searchQuery.trim() || undefined,
    role: apiRoleParam,
    status: apiStatusParam,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const isUsingFiller = useMemo(() => {
    if (query.isError) return true;
    if (!query.isLoading && (query.data?.total ?? 0) === 0 && !searchQuery.trim() && segmentView === 'ALL') {
      return true;
    }
    return false;
  }, [query.isError, query.isLoading, query.data, searchQuery, segmentView]);

  const allAdminsPool = useMemo(() => {
    if (isUsingFiller) return FILLER_ADMINS;
    return allQuery.data?.admins ?? [];
  }, [isUsingFiller, allQuery.data]);

  // Aggregate KPI metrics
  const kpis = useMemo(() => {
    let superAdmins = 0;
    let cityAdmins = 0;
    let supportStaff = 0;
    let financeStaff = 0;
    let activeStaff = 0;
    let suspendedStaff = 0;

    for (const a of allAdminsPool) {
      if (a.role === 'SUPER_ADMIN') superAdmins++;
      if (a.role === 'CITY_ADMIN') cityAdmins++;
      if (a.role === 'SUPPORT_ADMIN') supportStaff++;
      if (a.role === 'FINANCE_ADMIN') financeStaff++;
      if (a.status === 'ACTIVE') activeStaff++;
      if (a.status === 'SUSPENDED') suspendedStaff++;
    }

    return {
      total: allAdminsPool.length,
      superAdmins,
      cityAdmins,
      supportStaff,
      financeStaff,
      activeStaff,
      suspendedStaff,
    };
  }, [allAdminsPool]);

  // Local filtered list for filler preview mode
  const filteredFillerAdmins = useMemo(() => {
    if (!isUsingFiller) return [];
    let items = [...FILLER_ADMINS];

    // Segment filter
    if (segmentView === 'SUPER_ADMIN') items = items.filter((a) => a.role === 'SUPER_ADMIN');
    if (segmentView === 'CITY_ADMIN') items = items.filter((a) => a.role === 'CITY_ADMIN');
    if (segmentView === 'SUPPORT_ADMIN') items = items.filter((a) => a.role === 'SUPPORT_ADMIN');
    if (segmentView === 'FINANCE_ADMIN') items = items.filter((a) => a.role === 'FINANCE_ADMIN');
    if (segmentView === 'SUSPENDED') items = items.filter((a) => a.status === 'SUSPENDED');

    // Role dropdown filter
    if (roleFilter !== 'ALL') {
      items = items.filter((a) => a.role === roleFilter);
    }

    // Status dropdown filter
    if (statusFilter !== 'ALL') {
      items = items.filter((a) => a.status === statusFilter);
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter(
        (a) =>
          (a.name?.toLowerCase().includes(q) ?? false) ||
          (a.email?.toLowerCase().includes(q) ?? false) ||
          a.phoneE164.includes(q),
      );
    }

    return items;
  }, [isUsingFiller, segmentView, roleFilter, statusFilter, searchQuery]);

  const displayedAdmins = useMemo(() => {
    if (isUsingFiller) {
      const start = (page - 1) * PAGE_SIZE;
      return filteredFillerAdmins.slice(start, start + PAGE_SIZE);
    }
    return query.data?.admins ?? [];
  }, [isUsingFiller, filteredFillerAdmins, query.data, page]);

  const totalCount = isUsingFiller ? filteredFillerAdmins.length : (query.data?.total ?? 0);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;

  const handleOpenDetail = (admin: AdminUserSummaryDto) => {
    setSelectedAdmin(admin);
    setIsDetailOpen(true);
  };

  const handleOpenEdit = (admin: AdminUserSummaryDto, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditTargetAdmin(admin);
    setIsEditDialogOpen(true);
  };

  const handleOpenStatus = (admin: AdminUserSummaryDto, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setStatusTargetAdmin(admin);
    setIsStatusDialogOpen(true);
  };

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    roleFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    segmentView !== 'ALL';

  const handleClearFilters = () => {
    setSearchQuery('');
    setRoleFilter('ALL');
    setStatusFilter('ALL');
    setSegmentView('ALL');
    setPage(1);
  };

  const columns: Column<AdminUserSummaryDto>[] = [
    {
      key: 'name',
      header: 'Staff Member',
      render: (a) => (
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0 font-bold text-sm shadow-sm">
            {a.name
              ? a.name
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()
              : 'AD'}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-text truncate">
              {a.name || 'Unnamed Operator'}
            </span>
            <span className="text-xs text-text-subtle truncate max-w-[220px]">
              {a.email || 'No email registered'}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Assigned Role',
      render: (a) => <AdminRoleBadge role={a.role} />,
    },
    {
      key: 'jurisdiction',
      header: 'Territory Jurisdiction',
      render: (a) => {
        if (a.role === 'SUPER_ADMIN') {
          return (
            <div className="flex items-center gap-1.5 text-xs text-purple-700 dark:text-purple-300 font-medium">
              <Globe className="size-3.5 text-purple-600 shrink-0" />
              <span>Global Master Access</span>
            </div>
          );
        }
        if (a.role === 'CITY_ADMIN') {
          return (
            <div className="flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-300 font-medium">
              <Building2 className="size-3.5 text-blue-600 shrink-0" />
              <span>
                {a.cityZoneIds.length > 0
                  ? `${a.cityZoneIds.length} Regional ${a.cityZoneIds.length === 1 ? 'Zone' : 'Zones'}`
                  : 'No Zones Assigned'}
              </span>
            </div>
          );
        }
        if (a.role === 'FINANCE_ADMIN') {
          return (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300 font-medium">
              <Wallet className="size-3.5 text-amber-600 shrink-0" />
              <span>Ledger & Adjustments</span>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
            <Headphones className="size-3.5 text-emerald-600 shrink-0" />
            <span>Support Desk Access</span>
          </div>
        );
      },
    },
    {
      key: 'phone',
      header: 'Contact Phone',
      render: (a) => (
        <div className="flex items-center gap-1.5">
          <Phone className="size-3.5 text-text-subtle shrink-0" />
          <span className="text-sm font-mono text-text">{formatPhone(a.phoneE164)}</span>
          <CopyPhoneButton phone={a.phoneE164} />
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Account Status',
      render: (a) => <AdminStatusBadge status={a.status} />,
    },
    {
      key: 'createdAt',
      header: 'Provisioned',
      render: (a) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-text flex items-center gap-1.5">
            <Calendar className="size-3.5 text-text-subtle" />
            {formatDate(a.createdAt)}
          </span>
          <span className="text-xs text-text-subtle flex items-center gap-1 mt-0.5">
            <Clock className="size-3" />
            {formatTimeAgo(a.createdAt)}
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (a) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenDetail(a);
            }}
          >
            Profile
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => handleOpenEdit(a, e)}
            icon={<Edit2 className="size-3.5 text-text-subtle" />}
            aria-label="Edit Staff Details"
            title="Edit Staff Member"
          />

          <Button
            size="sm"
            variant={a.status === 'SUSPENDED' ? 'secondary' : 'danger'}
            onClick={(e) => handleOpenStatus(a, e)}
            icon={
              a.status === 'SUSPENDED' ? (
                <UserCheck className="size-3.5 text-success" />
              ) : (
                <UserX className="size-3.5 text-danger" />
              )
            }
            aria-label={a.status === 'SUSPENDED' ? 'Reactivate Staff' : 'Suspend Staff'}
            title={a.status === 'SUSPENDED' ? 'Reactivate Staff' : 'Suspend Staff'}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-8 max-w-[1600px] mx-auto w-full">
      {/* Page Header */}
      <PageHeader
        title="Staff & Role Management"
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Staff & Roles' }]}
        actions={
          <div className="flex items-center gap-2">
            {isUsingFiller && (
              <Badge tone="warning" className="text-xs py-1 px-2.5 font-medium">
                Demo Preview Mode
              </Badge>
            )}

            <Button
              variant="secondary"
              icon={<KeyRound className="size-4" />}
              onClick={() => setIsMatrixOpen(true)}
            >
              Role Matrix
            </Button>

            <Button
              variant="primary"
              icon={<UserPlus className="size-4" />}
              onClick={() => setIsCreateOpen(true)}
            >
              Add Admin User
            </Button>

            <Button
              icon={<RefreshCw className={`size-4 ${query.isFetching ? 'animate-spin' : ''}`} />}
              loading={query.isFetching}
              onClick={() => {
                query.refetch();
                allQuery.refetch();
              }}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* Operational KPI Stat Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatTile
          label="Total Admin Staff"
          value={kpis.total}
          icon={<Users className="size-4 text-interactive" />}
          hint="Provisioned operator accounts"
          tone="default"
          loading={query.isLoading && !isUsingFiller}
        />
        <StatTile
          label="Super Administrators"
          value={kpis.superAdmins}
          icon={<ShieldAlert className="size-4 text-purple-600" />}
          hint="Master system control plane"
          tone="default"
          loading={query.isLoading && !isUsingFiller}
        />
        <StatTile
          label="City Administrators"
          value={kpis.cityAdmins}
          icon={<Building2 className="size-4 text-blue-600" />}
          hint="Territory & driver oversight"
          tone="default"
          loading={query.isLoading && !isUsingFiller}
        />
        <StatTile
          label="Support Specialists"
          value={kpis.supportStaff}
          icon={<Headphones className="size-4 text-emerald-600" />}
          hint="Desk dispute & rider support"
          tone="success"
          loading={query.isLoading && !isUsingFiller}
        />
        <StatTile
          label="Active Accounts"
          value={kpis.activeStaff}
          icon={<CheckCircle2 className="size-4 text-success" />}
          hint={`${kpis.suspendedStaff} suspended accounts`}
          tone="success"
          loading={query.isLoading && !isUsingFiller}
        />
      </div>

      {/* Segmented View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <SegmentedControl<SegmentView>
          label="Staff Filter"
          value={segmentView}
          onValueChange={(val: SegmentView) => {
            setSegmentView(val);
            setPage(1);
          }}
          segments={[
            { value: 'ALL', label: `All Staff (${kpis.total})` },
            { value: 'SUPER_ADMIN', label: `Super Admin (${kpis.superAdmins})` },
            { value: 'CITY_ADMIN', label: `City Admin (${kpis.cityAdmins})` },
            { value: 'SUPPORT_ADMIN', label: `Support (${kpis.supportStaff})` },
            { value: 'FINANCE_ADMIN', label: `Finance (${kpis.financeStaff})` },
            {
              value: 'SUSPENDED',
              label: `Suspended (${kpis.suspendedStaff})`,
            },
          ]}
        />
      </div>

      {/* Filter Toolbar */}
      <FilterBar>
        <FilterField label="Search Operator">
          <SearchInput
            placeholder="Search by name, email, or mobile phone..."
            value={searchQuery}
            onChange={(val: string) => {
              setSearchQuery(val);
              setPage(1);
            }}
          />
        </FilterField>

        <FilterField label="Role Filter">
          <Select
            value={roleFilter}
            onValueChange={(val: string) => {
              setRoleFilter(val);
              setPage(1);
            }}
            options={ROLE_FILTER_OPTIONS}
            className="w-full sm:w-52"
          />
        </FilterField>

        <FilterField label="Status Filter">
          <Select
            value={statusFilter}
            onValueChange={(val: string) => {
              setStatusFilter(val);
              setPage(1);
            }}
            options={STATUS_FILTER_OPTIONS}
            className="w-full sm:w-48"
          />
        </FilterField>

        {hasActiveFilters && (
          <div className="flex items-end">
            <Button size="sm" variant="ghost" onClick={handleClearFilters} className="text-xs h-9">
              Clear Filters
            </Button>
          </div>
        )}
      </FilterBar>

      {/* Data Table */}
      {query.isLoading && !isUsingFiller ? (
        <DataTable<AdminUserSummaryDto>
          columns={columns}
          rows={[]}
          rowKey={(a) => a.id}
          density="comfortable"
        />
      ) : query.isError && !isUsingFiller ? (
        <ErrorState
          title="Failed to load administrative staff"
          message={(query.error as Error)?.message || 'An unexpected network error occurred.'}
          onRetry={() => query.refetch()}
        />
      ) : displayedAdmins.length === 0 ? (
        <EmptyState
          title="No administrative staff found"
          description={
            hasActiveFilters
              ? 'No staff members match the selected search or filter criteria.'
              : 'No administrators have been provisioned yet.'
          }
          action={
            hasActiveFilters ? (
              <Button variant="secondary" onClick={handleClearFilters}>
                Reset Filters
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
                Add First Admin
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          <DataTable<AdminUserSummaryDto>
            columns={columns}
            rows={displayedAdmins}
            rowKey={(a) => a.id}
            onRowClick={(a) => handleOpenDetail(a)}
            density="comfortable"
          />

          <Pagination
            page={page}
            pageCount={totalPages}
            total={totalCount}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Modals & Dialogs */}
      <RolePermissionsMatrixModal
        open={isMatrixOpen}
        onOpenChange={setIsMatrixOpen}
      />

      <AdminCreateDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSuccess={() => {
          query.refetch();
          allQuery.refetch();
        }}
      />

      <AdminDetailModal
        adminId={selectedAdmin?.id ?? null}
        initialAdmin={selectedAdmin}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onRefresh={() => {
          query.refetch();
          allQuery.refetch();
        }}
      />

      <AdminEditDialog
        admin={editTargetAdmin}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSuccess={() => {
          query.refetch();
          allQuery.refetch();
        }}
      />

      <AdminStatusDialog
        admin={statusTargetAdmin}
        open={isStatusDialogOpen}
        onOpenChange={setIsStatusDialogOpen}
        onSuccess={() => {
          query.refetch();
          allQuery.refetch();
        }}
      />
    </div>
  );
}
