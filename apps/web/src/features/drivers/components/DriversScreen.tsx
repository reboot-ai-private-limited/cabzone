'use client';

import { useState } from 'react';
import {
  Button,
  type Column,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  Select,
  Skeleton,
} from '@cabzone/design-system';
import { DRIVER_APPLICATION_STATUSES, type DriverApplicationStatus } from '@cabzone/contracts';
import type { DriverApplicationSummaryDto } from '@/lib/api/endpoints/drivers';
import { useDriverApplications } from '../hooks/useDriverApplications';
import { DriverApplicationDialog } from './DriverApplicationDialog';
import { StatusBadge } from './StatusBadge';

const PAGE_SIZE = 25;
type Filter = 'ALL' | DriverApplicationStatus;

const FILTER_OPTIONS = [
  { value: 'ALL', label: 'All applications' },
  ...DRIVER_APPLICATION_STATUSES.map((s) => ({ value: s, label: s.replaceAll('_', ' ') })),
];

const date = (iso: string | null): string =>
  iso === null ? '—' : new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });

export function DriversScreen() {
  // Land on the work queue: applications waiting for a decision.
  const [filter, setFilter] = useState<Filter>('SUBMITTED');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState<string | null>(null);

  const apps = useDriverApplications({
    ...(filter === 'ALL' ? {} : { status: filter }),
    limit,
  });
  const rows = apps.data ?? [];

  const columns: Column<DriverApplicationSummaryDto>[] = [
    {
      key: 'phone',
      header: 'Driver',
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-mono text-sm font-medium text-text">{r.phoneE164 ?? '—'}</span>
          <span className="font-mono text-xs text-text-subtle">{r.application.driverId.slice(0, 8)}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Application',
      render: (r) => <StatusBadge status={r.application.status} />,
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      render: (r) =>
        r.vehicle === null ? (
          <span className="text-text-subtle">None</span>
        ) : (
          <div className="flex flex-col">
            <span className="text-sm">
              {r.vehicle.make} {r.vehicle.model}
            </span>
            <span className="font-mono text-xs text-text-subtle">{r.vehicle.registrationNumber}</span>
          </div>
        ),
    },
    {
      key: 'submitted',
      header: 'Submitted',
      render: (r) => (
        <span className="text-sm text-text-subtle">{date(r.application.submittedAt)}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-8 max-w-[1600px] mx-auto w-full">
      <PageHeader
        title="Drivers & KYC"
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Drivers & KYC' }]}
      />

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

      {apps.isLoading ? (
        <Skeleton className="h-64 rounded-md" />
      ) : apps.isError ? (
        <ErrorState
          message={apps.error instanceof Error ? apps.error.message : 'Could not load applications.'}
          onRetry={() => void apps.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={filter === 'SUBMITTED' ? 'Nothing waiting for review' : 'No applications found'}
          description="Driver applications appear here once submitted from the driver app."
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.application.id}
            onRowClick={(r) => setOpenId(r.application.id)}
            refetching={apps.isFetching}
          />
          {rows.length >= limit && (
            <div className="flex justify-center">
              <Button onClick={() => setLimit((l) => l + PAGE_SIZE)}>Show more</Button>
            </div>
          )}
        </>
      )}

      <DriverApplicationDialog
        applicationId={openId}
        onOpenChange={(open) => !open && setOpenId(null)}
      />
    </div>
  );
}
