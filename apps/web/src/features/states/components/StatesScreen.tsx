'use client';

import { useState } from 'react';
import { History, Pencil, Power, Upload } from 'lucide-react';
import {
  Badge,
  Button,
  type Column,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '@cabzone/design-system';
import type { StateBoundaryDto } from '@/lib/api/endpoints/states';
import { StateImportDialog } from '@/features/zones/components/StateImportDialog';
import { useAllStates, useSetStateStatus } from '../hooks/useStatesAdmin';
import { StateEditDialog } from './StateEditDialog';
import { StateHistoryDialog } from './StateHistoryDialog';

export function StatesScreen() {
  const states = useAllStates();
  const setStatus = useSetStateStatus();
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<StateBoundaryDto | null>(null);
  const [viewingHistory, setViewingHistory] = useState<StateBoundaryDto | null>(null);
  const [actionError, setActionError] = useState<string | undefined>(undefined);

  const toggle = (state: StateBoundaryDto): void => {
    setActionError(undefined);
    setStatus.mutate(
      { state, action: state.status === 'ACTIVE' ? 'deactivate' : 'activate' },
      {
        onError: (e) =>
          setActionError(e instanceof Error ? e.message : 'Could not update the state.'),
      },
    );
  };

  const columns: Column<StateBoundaryDto>[] = [
    {
      key: 'state',
      header: 'State',
      render: (r) => <span className="font-semibold text-text">{r.stateName}</span>,
    },
    {
      key: 'code',
      header: 'Code',
      render: (r) => (
        <Badge tone="accent" className="font-mono font-bold tracking-wider">
          {r.stateCode}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge tone={r.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {r.status === 'ACTIVE' ? 'Active' : 'Disabled'}
        </Badge>
      ),
    },
    {
      key: 'intrastate',
      header: 'Intrastate',
      render: (r) => <Flag on={r.intrastateEnabled} />,
    },
    {
      key: 'interstate',
      header: 'Interstate',
      render: (r) => <Flag on={r.interstateDropOffEnabled} />,
    },
    {
      key: 'version',
      header: 'Boundary',
      numeric: true,
      render: (r) => <span className="font-mono text-sm text-text-subtle">v{r.version}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" icon={<Pencil aria-hidden className="size-3.5" />} onClick={() => setEditing(r)}>
            Edit
          </Button>
          <Button
            size="sm"
            icon={<Power aria-hidden className="size-3.5" />}
            loading={setStatus.isPending && setStatus.variables?.state.stateCode === r.stateCode}
            onClick={() => toggle(r)}
          >
            {r.status === 'ACTIVE' ? 'Disable' : 'Enable'}
          </Button>
          <Button
            size="sm"
            icon={<History aria-hidden className="size-3.5" />}
            onClick={() => setViewingHistory(r)}
          >
            History
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-8 max-w-[1600px] mx-auto w-full">
      <PageHeader
        title="States"
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'States' }]}
        actions={
          <Button
            variant="primary"
            icon={<Upload aria-hidden className="size-4" />}
            onClick={() => setImportOpen(true)}
          >
            Import borders
          </Button>
        }
      />

      {actionError !== undefined && (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      )}

      {states.isLoading ? (
        <Skeleton className="h-64 rounded-md" />
      ) : states.isError ? (
        <ErrorState
          message={states.error instanceof Error ? states.error.message : 'Could not load states.'}
          onRetry={() => void states.refetch()}
        />
      ) : (states.data ?? []).length === 0 ? (
        <EmptyState
          title="No states imported yet"
          description="Import a GeoJSON file of state borders to make West Bengal, Bihar, Sikkim and Assam serviceable."
        />
      ) : (
        <DataTable
          columns={columns}
          rows={states.data ?? []}
          rowKey={(r) => r.stateCode}
          refetching={states.isFetching}
        />
      )}

      <StateImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <StateEditDialog state={editing} onOpenChange={(o) => !o && setEditing(null)} />
      <StateHistoryDialog state={viewingHistory} onOpenChange={(o) => !o && setViewingHistory(null)} />
    </div>
  );
}

function Flag({ on }: { on: boolean }) {
  return <Badge tone={on ? 'success' : 'neutral'}>{on ? 'Enabled' : 'Disabled'}</Badge>;
}
