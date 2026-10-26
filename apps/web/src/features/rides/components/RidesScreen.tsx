'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, List, MapPin, RefreshCw } from 'lucide-react';
import {
  Badge,
  Button,
  type Column,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
} from '@cabzone/design-system';
import { type AdminRole, RIDE_STATUSES, type RideStatus } from '@cabzone/contracts';
import { getStoredAdminRole } from '@/features/auth/lib/authApi';
import {
  ACTIVE_RIDE_STATUSES,
  type AdminRideDto,
  type DisputeQueueStatus,
  type PaymentDisputeQueueItemDto,
} from '@/lib/api/endpoints/rides';
import { formatPaise } from '@/lib/format';
import { usePaymentDisputes, useRides } from '../hooks/useRides';
import { RideDetailDialog } from './RideDetailDialog';
import { RideDispatchMap } from './RideDispatchMap';
import { RideStatusBadge } from './RideStatusBadge';

const PAGE_SIZE = 25;

type Filter = 'LIVE' | 'ALL' | RideStatus;
type ViewMode = 'map' | 'table' | 'disputes';

const FILTER_OPTIONS = [
  { value: 'LIVE', label: 'Live (in progress)' },
  { value: 'ALL', label: 'All rides' },
  ...RIDE_STATUSES.map((s) => ({ value: s, label: s.replaceAll('_', ' ') })),
];

const DISPUTE_STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Open disputes (awaiting ruling)' },
  { value: 'RESOLVED', label: 'Resolved disputes (audit trail)' },
  { value: 'ALL', label: 'All dispute tickets' },
];

const toStatuses = (f: Filter): RideStatus[] | undefined =>
  f === 'LIVE' ? ACTIVE_RIDE_STATUSES : f === 'ALL' ? undefined : [f];

const when = (iso: string): string =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });

export function RidesScreen() {
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [filter, setFilter] = useState<Filter>('LIVE');
  const [disputeFilter, setDisputeFilter] = useState<DisputeQueueStatus>('OPEN');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<AdminRideDto | null>(null);
  const [selectedDispute, setSelectedDispute] = useState<PaymentDisputeQueueItemDto | null>(null);

  useEffect(() => {
    setAdminRole(getStoredAdminRole());
  }, []);

  const canViewDisputes = adminRole !== 'CITY_ADMIN';
  const statuses = toStatuses(filter);
  const rides = useRides({ ...(statuses === undefined ? {} : { statuses }), limit });
  const disputes = usePaymentDisputes(
    disputeFilter,
    canViewDisputes && viewMode === 'disputes',
  );
  const rows = rides.data ?? [];
  const disputeRows = disputes.data ?? [];

  const columns: Column<AdminRideDto>[] = [
    {
      key: 'id',
      header: 'Ride',
      render: (r) => <span className="font-mono text-sm">{r.id.slice(0, 8)}</span>,
    },
    { key: 'status', header: 'Status', render: (r) => <RideStatusBadge status={r.status} /> },
    {
      key: 'passenger',
      header: 'Passenger',
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-medium text-text">{r.passenger.name}</span>
          <span className="font-mono text-xs text-text-subtle">{r.passenger.phoneE164}</span>
        </div>
      ),
    },
    {
      key: 'driver',
      header: 'Driver',
      render: (r) =>
        r.driverId === null ? (
          <span className="text-text-subtle">—</span>
        ) : (
          <span className="font-mono text-sm">{r.driverId.slice(0, 8)}</span>
        ),
    },
    { key: 'vehicle', header: 'Vehicle', render: (r) => r.vehicleCategory },
    {
      key: 'fare',
      header: 'Fare',
      numeric: true,
      align: 'right',
      render: (r) => formatPaise(r.agreedFarePaise ?? r.proposedFarePaise ?? r.suggestedFarePaise),
    },
    {
      key: 'requested',
      header: 'Requested',
      render: (r) => <span className="text-sm text-text-subtle">{when(r.createdAt)}</span>,
    },
  ];

  const disputeColumns: Column<PaymentDisputeQueueItemDto>[] = [
    {
      key: 'rideId',
      header: 'Ride',
      render: (item) => <span className="font-mono text-sm">{item.ride.id.slice(0, 8)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => <RideStatusBadge status={item.ride.status} />,
    },
    {
      key: 'passenger',
      header: 'Passenger',
      render: (item) => (
        <div className="flex flex-col">
          <span className="font-medium text-text">{item.ride.passenger.name}</span>
          <span className="font-mono text-xs text-text-subtle">
            {item.ride.passenger.phoneE164}
          </span>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Dispute Reason',
      render: (item) => (
        <span className="text-xs text-text line-clamp-2 max-w-xs">
          {typeof item.ticket.metadata?.reason === 'string'
            ? item.ticket.metadata.reason
            : 'No reason recorded'}
        </span>
      ),
    },
    {
      key: 'payment',
      header: 'Payment / Ref',
      render: (item) => (
        <div className="flex flex-col text-xs">
          <span className="font-medium text-text">
            {item.evidence.paymentCollection ?? 'CASH'}
          </span>
          <span className="font-mono text-text-subtle">
            {item.evidence.providerPaymentId ?? item.evidence.providerOrderId ?? 'Cash / Direct'}
          </span>
        </div>
      ),
    },
    {
      key: 'commission',
      header: 'Commission / Refund',
      numeric: true,
      align: 'right',
      render: (item) => (
        <div className="flex flex-col items-end text-xs font-mono">
          <span>Charged: {formatPaise(item.evidence.commissionChargedPaise)}</span>
          {item.evidence.commissionRefundedPaise > 0 && (
            <span className="text-success">
              Refunded: {formatPaise(item.evidence.commissionRefundedPaise)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'resolution',
      header: 'Outcome',
      render: (item) => {
        const outcome =
          typeof item.resolution?.metadata?.outcome === 'string'
            ? item.resolution.metadata.outcome
            : null;
        if (!outcome) return <Badge tone="warning">OPEN</Badge>;
        return (
          <Badge tone={outcome === 'RIDER_WINS' ? 'info' : 'success'}>
            {outcome.replaceAll('_', ' ')}
          </Badge>
        );
      },
    },
    {
      key: 'filedAt',
      header: 'Filed',
      render: (item) => (
        <span className="text-sm text-text-subtle">{when(item.ticket.createdAt)}</span>
      ),
    },
  ];

  const activeRides = rows.filter((r) => ACTIVE_RIDE_STATUSES.includes(r.status));

  const segments = [
    { value: 'map' as const, label: 'Dispatch Map', icon: <MapPin className="size-3.5" /> },
    { value: 'table' as const, label: 'Table View', icon: <List className="size-3.5" /> },
    ...(canViewDisputes
      ? [
          {
            value: 'disputes' as const,
            label: 'Disputes & Refunds',
            icon: <AlertTriangle className="size-3.5" />,
          },
        ]
      : []),
  ];

  const isRefreshing = viewMode === 'disputes' ? disputes.isFetching : rides.isFetching;

  return (
    <div className="flex flex-col gap-6 p-8 max-w-[1600px] mx-auto w-full">
      <PageHeader
        title="Live Rides"
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Live Rides' }]}
        actions={
          <div className="flex items-center gap-3">
            <SegmentedControl<ViewMode>
              value={viewMode}
              onValueChange={setViewMode}
              label="Rides view"
              segments={segments}
            />
            <Button
              icon={<RefreshCw aria-hidden className="size-4" />}
              loading={isRefreshing}
              onClick={() =>
                void (viewMode === 'disputes' ? disputes.refetch() : rides.refetch())
              }
            >
              Refresh
            </Button>
          </div>
        }
      />

      {viewMode === 'map' ? (
        <div className="flex flex-col gap-6">
          <RideDispatchMap
            rides={rows}
            onSelectRide={(r) => {
              setSelectedDispute(null);
              setSelected(r);
            }}
            selectedRideId={selected?.id}
          />

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-wide text-text uppercase">
                Active Trips in Progress ({activeRides.length})
              </h2>
              <span className="text-xs text-text-subtle">
                Click any ride below or on map to inspect
              </span>
            </div>

            {rides.isLoading ? (
              <Skeleton className="h-48 rounded-md" />
            ) : rides.isError ? (
              <ErrorState
                message={
                  rides.error instanceof Error ? rides.error.message : 'Could not load active rides.'
                }
                onRetry={() => void rides.refetch()}
              />
            ) : activeRides.length === 0 ? (
              <EmptyState
                title="No active trips right now"
                description="Live ride requests and assigned trips will appear here and on the dispatch radar."
              />
            ) : (
              <DataTable
                columns={columns}
                rows={activeRides}
                rowKey={(r) => r.id}
                onRowClick={(r) => {
                  setSelectedDispute(null);
                  setSelected(r);
                }}
                refetching={rides.isFetching}
              />
            )}
          </div>
        </div>
      ) : viewMode === 'table' ? (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <div className="w-64">
              <Select
                value={filter}
                onValueChange={(v) => {
                  setFilter(v as Filter);
                  setLimit(PAGE_SIZE);
                }}
                options={FILTER_OPTIONS}
              />
            </div>
            <span className="text-xs text-text-subtle">Updates every 10 seconds</span>
          </div>

          {rides.isLoading ? (
            <Skeleton className="h-64 rounded-md" />
          ) : rides.isError ? (
            <ErrorState
              message={rides.error instanceof Error ? rides.error.message : 'Could not load rides.'}
              onRetry={() => void rides.refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title={filter === 'LIVE' ? 'No rides in progress' : 'No rides match this filter'}
              description="New ride requests appear here as riders book."
            />
          ) : (
            <>
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(r) => r.id}
                onRowClick={(r) => {
                  setSelectedDispute(null);
                  setSelected(r);
                }}
                refetching={rides.isFetching}
              />
              {rows.length >= limit && (
                <div className="flex justify-center">
                  <Button onClick={() => setLimit((l) => l + PAGE_SIZE)}>Show more</Button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-72">
                <Select
                  value={disputeFilter}
                  onValueChange={(v) => setDisputeFilter(v as DisputeQueueStatus)}
                  options={DISPUTE_STATUS_OPTIONS}
                />
              </div>
              <span className="text-xs text-text-subtle">
                Click any ticket to inspect payment evidence or issue a ruling
              </span>
            </div>
          </div>

          {disputes.isLoading ? (
            <Skeleton className="h-64 rounded-md" />
          ) : disputes.isError ? (
            <ErrorState
              message={
                disputes.error instanceof Error
                  ? disputes.error.message
                  : 'Could not load payment disputes.'
              }
              onRetry={() => void disputes.refetch()}
            />
          ) : disputeRows.length === 0 ? (
            <EmptyState
              title="No payment disputes match this filter"
              description="Rider-filed payment disputes and commission refund rulings appear here."
            />
          ) : (
            <DataTable
              columns={disputeColumns}
              rows={disputeRows}
              rowKey={(item) => item.ticket.id}
              onRowClick={(item) => {
                setSelectedDispute(item);
                setSelected(item.ride);
              }}
              refetching={disputes.isFetching}
            />
          )}
        </div>
      )}

      <RideDetailDialog
        ride={selected}
        dispute={selectedDispute}
        adminRole={adminRole}
        onRideUpdated={(updated) => {
          setSelected(updated);
          void rides.refetch();
          if (canViewDisputes && viewMode === 'disputes') {
            void disputes.refetch();
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setSelectedDispute(null);
          }
        }}
      />
    </div>
  );
}
