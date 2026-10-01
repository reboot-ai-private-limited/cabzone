'use client';

import { Dialog, EmptyState, Skeleton } from '@cabzone/design-system';
import type { StateBoundaryDto, StateHistoryEntryDto } from '@/lib/api/endpoints/states';
import { useStateHistory } from '../hooks/useStatesAdmin';

const LABELS: Record<StateHistoryEntryDto['action'], string> = {
  IMPORTED: 'Boundary imported',
  UPDATED: 'Settings edited',
  ACTIVATED: 'Enabled',
  DEACTIVATED: 'Disabled',
};

export function StateHistoryDialog({
  state,
  onOpenChange,
}: {
  state: StateBoundaryDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const history = useStateHistory(state?.stateCode ?? null);
  const entries = history.data ?? [];

  return (
    <Dialog
      open={state !== null}
      onOpenChange={onOpenChange}
      title={state === null ? '' : `${state.stateName} history`}
      description="Replaced borders are kept here, never overwritten."
    >
      {history.isLoading ? (
        <Skeleton className="h-24 rounded-md" />
      ) : entries.length === 0 ? (
        <EmptyState title="No history yet" description="Changes to this state will appear here." />
      ) : (
        <ol className="flex flex-col divide-y divide-border text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5 py-2">
              <span className="font-semibold text-text">
                {LABELS[e.action]}
                {e.action === 'IMPORTED' && e.previousGeometry !== null && (
                  <span className="ml-2 text-xs font-normal text-text-subtle">
                    replaced the previous border
                  </span>
                )}
              </span>
              <span className="text-xs text-text-subtle">
                {new Date(e.at).toLocaleString()} · boundary v{e.version} · settings v
                {e.configVersion}
                {e.actorId && ` · by ${e.actorId}`}
                {e.source !== null && ` · ${e.source}`}
                {e.sourceVersion !== null && ` (${e.sourceVersion})`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}
