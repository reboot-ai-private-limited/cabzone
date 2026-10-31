'use client';

import { useMemo, useState } from 'react';
import {
  Building2,
  Calendar,
  CheckCircle2,
  Edit2,
  Globe,
  Headphones,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  Wallet,
} from 'lucide-react';
import {
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

type SegmentView =
  | 'ALL'
  | 'SUPER_ADMIN'
  | 'CITY_ADMIN'
  | 'SUPPORT_ADMIN'
  | 'FINANCE_ADMIN'
  | 'SUSPENDED';

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

  // Query for KPI counts (strictly server-owned; never injects sample accounts)
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

  const allAdminsPool = useMemo(() => allQuery.data?.admins ?? [], [allQuery.data?.admins]);

  // Aggregate KPI metrics from live server records
  const kpis = useMemo(() => {
    if (allQuery.isError || !allQuery.data) {
      return {
        total: null as number | null,
        superAdmins: null as number | null,
        cityAdmins: null as number | null,
        supportStaff: null as number | null,
        financeStaff: null as number | null,
        activeStaff: null as number | null,
        suspendedStaff: null as number | null,
      };
    }

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
      total: allQuery.data.total,
      superAdmins,
      cityAdmins,
      supportStaff,
      financeStaff,
      activeStaff,
      suspendedStaff,
    };
  }, [allAdminsPool, allQuery.data, allQuery.isError]);

  const displayedAdmins = useMemo(() => query.data?.admins ?? [], [query.data?.admins]);
  const totalCount = query.data?.total ?? 0;
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
      header: 'Name',
      render: (a) => (
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-full bg-surface-muted text-text border border-border-strong flex items-center justify-center shrink-0 font-bold text-xs shadow-xs">
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
              {a.name || 'Unnamed Admin'}
            </span>
            {a.email && (
              <span className="text-xs text-text-subtle truncate max-w-[200px]">
                {a.email}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'adminId',
      header: 'Admin ID',
      render: (a) => (
        <span className="font-mono text-xs font-medium text-text-subtle">
          {a.id.slice(0, 8)}
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (a) => <AdminRoleBadge role={a.role} />,
    },
    {
      key: 'jurisdiction',
      header: 'Cities',
      render: (a) => {
        if (a.role === 'SUPER_ADMIN') {
          return (
            <div className="flex items-center gap-1.5 text-xs text-text font-medium">
              <Globe className="size-3.5 text-text-subtle shrink-0" />
              <span>Global Access</span>
            </div>
          );
        }
        if (a.role === 'CITY_ADMIN') {
          return (
            <div className="flex items-center gap-1.5 text-xs text-text font-medium">
              <Building2 className="size-3.5 text-text-subtle shrink-0" />
              <span>
                {a.cityZoneIds.length > 0
                  ? `${a.cityZoneIds.length} ${a.cityZoneIds.length === 1 ? 'City' : 'Cities'}`
                  : 'All Cities'}
              </span>
            </div>
          );
        }
        if (a.role === 'FINANCE_ADMIN') {
          return (
            <div className="flex items-center gap-1.5 text-xs text-text font-medium">
              <Wallet className="size-3.5 text-text-subtle shrink-0" />
              <span>Finance</span>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-1.5 text-xs text-text font-medium">
            <Headphones className="size-3.5 text-text-subtle shrink-0" />
            <span>Support</span>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => <AdminStatusBadge status={a.status} />,
    },
    {
      key: 'createdAt',
      header: 'Joined',
      render: (a) => (
        <span className="text-sm font-medium text-text flex items-center gap-1.5">
          <Calendar className="size-3.5 text-text-subtle" />
          {formatDate(a.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (a) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenDetail(a);
            }}
            className="h-8 px-2.5 rounded-lg border border-border-strong bg-surface text-text hover:bg-surface-muted text-xs font-semibold transition-colors cursor-pointer"
          >
            Profile
          </button>

          <button
            type="button"
            onClick={(e) => handleOpenEdit(a, e)}
            aria-label="Edit Admin"
            title="Edit Admin"
            className="h-8 w-8 rounded-lg border border-border-strong bg-surface text-text hover:bg-surface-muted flex items-center justify-center transition-colors cursor-pointer"
          >
            <Edit2 className="size-3.5" />
          </button>

          <button
            type="button"
            onClick={(e) => handleOpenStatus(a, e)}
            aria-label={a.status === 'SUSPENDED' ? 'Reactivate Admin' : 'Suspend Admin'}
            title={a.status === 'SUSPENDED' ? 'Reactivate Admin' : 'Suspend Admin'}
            className={`h-8 w-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
              a.status === 'SUSPENDED'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'border-border-strong bg-surface text-text-subtle hover:text-danger hover:border-danger/50 hover:bg-danger/10'
            }`}
          >
            {a.status === 'SUSPENDED' ? (
              <UserCheck className="size-3.5" />
            ) : (
              <UserX className="size-3.5 text-danger" />
            )}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-8 max-w-[1600px] mx-auto w-full">
      {/* Page Header */}
      <PageHeader
        title="Admin Users & Roles"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              icon={<UserPlus className="size-4" />}
              onClick={() => setIsCreateOpen(true)}
            >
              Add Admin
            </Button>

            <Button
              variant="secondary"
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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatTile
          label="Total Admins"
          value={kpis.total ?? '—'}
          icon={<Users className="size-4 text-interactive" />}
          tone="default"
          loading={allQuery.isPending}
        />
        <StatTile
          label="Super Admins"
          value={kpis.superAdmins ?? '—'}
          icon={<ShieldAlert className="size-4 text-purple-600" />}
          tone="default"
          loading={allQuery.isPending}
        />
        <StatTile
          label="City Admins"
          value={kpis.cityAdmins ?? '—'}
          icon={<Building2 className="size-4 text-blue-600" />}
          tone="default"
          loading={allQuery.isPending}
        />
        <StatTile
          label="Support Staff"
          value={kpis.supportStaff ?? '—'}
          icon={<Headphones className="size-4 text-emerald-600" />}
          tone="success"
          loading={allQuery.isPending}
        />
        <StatTile
          label="Active Accounts"
          value={kpis.activeStaff ?? '—'}
          icon={<CheckCircle2 className="size-4 text-success" />}
          tone="success"
          loading={allQuery.isPending}
        />
      </div>

      {/* Segmented View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <SegmentedControl<SegmentView>
          label="Filter"
          value={segmentView}
          onValueChange={(val: SegmentView) => {
            setSegmentView(val);
            setPage(1);
          }}
          segments={[
            { value: 'ALL', label: kpis.total !== null ? `All (${kpis.total})` : 'All' },
            {
              value: 'SUPER_ADMIN',
              label:
                kpis.superAdmins !== null ? `Super Admin (${kpis.superAdmins})` : 'Super Admin',
            },
            {
              value: 'CITY_ADMIN',
              label: kpis.cityAdmins !== null ? `City Admin (${kpis.cityAdmins})` : 'City Admin',
            },
            {
              value: 'SUPPORT_ADMIN',
              label: kpis.supportStaff !== null ? `Support (${kpis.supportStaff})` : 'Support',
            },
            {
              value: 'FINANCE_ADMIN',
              label: kpis.financeStaff !== null ? `Finance (${kpis.financeStaff})` : 'Finance',
            },
            {
              value: 'SUSPENDED',
              label:
                kpis.suspendedStaff !== null ? `Suspended (${kpis.suspendedStaff})` : 'Suspended',
            },
          ]}
        />
      </div>

      {/* Filter Toolbar */}
      <FilterBar>
        <FilterField label="Search Operator">
          <SearchInput
            placeholder="Search by name, email, or admin ID..."
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
      {query.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-64 w-full rounded-md" />
        </div>
      ) : query.isError ? (
        <ErrorState
          title="Failed to load administrative staff"
          message={(query.error as Error)?.message || 'An unexpected network error occurred.'}
          onRetry={() => void query.refetch()}
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
          void query.refetch();
          void allQuery.refetch();
        }}
      />

      <AdminDetailModal
        adminId={selectedAdmin?.id ?? null}
        initialAdmin={selectedAdmin}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onRefresh={() => {
          void query.refetch();
          void allQuery.refetch();
        }}
      />

      <AdminEditDialog
        admin={editTargetAdmin}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSuccess={() => {
          void query.refetch();
          void allQuery.refetch();
        }}
      />

      <AdminStatusDialog
        admin={statusTargetAdmin}
        open={isStatusDialogOpen}
        onOpenChange={setIsStatusDialogOpen}
        onSuccess={() => {
          void query.refetch();
          void allQuery.refetch();
        }}
      />
    </div>
  );
}
