'use client';

import type { StatePricingDto } from '@cabzone/contracts';
import { Badge } from '@cabzone/design-system';
import { type Column, DataTable } from '@cabzone/design-system';
import { EmptyState } from '@cabzone/design-system';
import { formatPaise } from '@/lib/format.js';
import { useStatesPricing } from '../hooks/usePricing.js';

export function StatePricingTable() {
  const { data: states, isLoading, isFetching } = useStatesPricing();

  const columns: Column<StatePricingDto>[] = [
    {
      key: 'stateCode',
      header: 'State Code',
      render: (row) => (
        <Badge tone="accent" className="font-mono font-bold tracking-wider">
          {row.stateCode}
        </Badge>
      ),
    },
    {
      key: 'version',
      header: 'Version',
      render: (row) => (
        <span className="font-mono text-sm text-text-subtle">v{row.version}</span>
      ),
    },
    {
      key: 'baseFare',
      header: 'Base Fare',
      numeric: true,
      render: (row) => (
        <span className="font-mono text-sm font-semibold text-text">
          {formatPaise(row.baseFarePaise)}
        </span>
      ),
    },
    {
      key: 'ratePerKm',
      header: 'Rate / km',
      numeric: true,
      render: (row) => (
        <span className="font-mono text-sm text-text">
          {formatPaise(row.ratePerKmPaise)}/km
        </span>
      ),
    },
    {
      key: 'minFare',
      header: 'Minimum Fare',
      numeric: true,
      render: (row) => (
        <span className="font-mono text-sm text-text">
          {formatPaise(row.minimumFarePaise)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'effectiveFrom',
      header: 'Effective Date',
      render: (row) => (
        <div className="flex flex-col text-sm text-text-subtle">
          <span>{new Date(row.effectiveFrom).toLocaleDateString()}</span>
          {row.effectiveTo && (
            <span className="text-xs text-danger">Until {new Date(row.effectiveTo).toLocaleDateString()}</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {states && states.length > 0 ? (
        <DataTable
          columns={columns}
          rows={states}
          rowKey={(r) => r.id}
          refetching={isFetching && !isLoading}
        />
      ) : (
        <EmptyState
          title="No state pricing rules found"
          description="Create interstate rate rules to enable rides traversing across state boundaries."
        />
      )}
    </div>
  );
}
