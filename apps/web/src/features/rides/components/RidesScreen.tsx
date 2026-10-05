'use client';

import { useState } from 'react';
import { List, MapPin, RefreshCw } from 'lucide-react';
import {
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
import { RIDE_STATUSES, type RideStatus } from '@cabzone/contracts';
import { ACTIVE_RIDE_STATUSES, type AdminRideDto } from '@/lib/api/endpoints/rides';
import { formatPaise } from '@/lib/format';
import { useRides } from '../hooks/useRides';
import { RideDetailDialog } from './RideDetailDialog';
import { RideDispatchMap } from './RideDispatchMap';
import { RideStatusBadge } from './RideStatusBadge';

const PAGE_SIZE = 25;

type Filter = 'LIVE' | 'ALL' | RideStatus;
type ViewMode = 'map' | 'table';

const FILTER_OPTIONS = [
  { value: 'LIVE', label: 'Live (in progress)' },
  { value: 'ALL', label: 'All rides' },
  ...RIDE_STATUSES.map((s) => ({ value: s, label: s.replaceAll('_', ' ') })),
];

const toStatuses = (f: Filter): RideStatus[] | undefined =>
  f === 'LIVE' ? ACTIVE_RIDE_STATUSES : f === 'ALL' ? undefined : [f];

const when = (iso: string): string =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });

export function RidesScreen() {
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [filter, setFilter] = useState<Filter>('LIVE');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<AdminRideDto | null>(null);

  const statuses = toStatuses(filter);
  const rides = useRides({ ...(statuses === undefined ? {} : { statuses }), limit });
  const rows = rides.data ?? [];

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

  const activeRides = rows.filter((r) => ACTIVE_RIDE_STATUSES.includes(r.status));

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
              segments={[
                { value: 'map', label: 'Dispatch Map', icon: <MapPin className="size-3.5" /> },
                { value: 'table', label: 'Table View', icon: <List className="size-3.5" /> },
              ]}
            />
            <Button
              icon={<RefreshCw aria-hidden className="size-4" />}
              loading={rides.isFetching}
              onClick={() => void rides.refetch()}
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
            onSelectRide={setSelected}
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
                message={rides.error instanceof Error ? rides.error.message : 'Could not load active rides.'}
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
                onRowClick={setSelected}
                refetching={rides.isFetching}
              />
            )}
          </div>
        </div>
      ) : (
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
                onRowClick={setSelected}
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
      )}

      <RideDetailDialog ride={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}
