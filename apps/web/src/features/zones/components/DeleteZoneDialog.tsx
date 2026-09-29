'use client';

import type { ZoneDto } from '@cabzone/contracts';
import { ConfirmDialog } from '@cabzone/design-system';
import { useDeleteZone } from '../hooks/useDeleteZone';

export function DeleteZoneDialog({
  zone,
  onOpenChange,
  onDeleted,
}: {
  zone: ZoneDto | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const remove = useDeleteZone();

  return (
    <ConfirmDialog
      open={zone !== null}
      onOpenChange={onOpenChange}
      title={zone === null ? '' : `Delete “${zone.name}”?`}
      consequences={[
        'The zone and its boundary are permanently removed.',
        'This cannot be undone. Use Deactivate instead to keep the zone on record.',
      ]}
      confirmLabel="Delete zone"
      loading={remove.isPending}
      onConfirm={() => {
        if (zone === null) return;
        remove.mutate(zone.id, {
          onSuccess: () => {
            onOpenChange(false);
            onDeleted();
          },
        });
      }}
    />
  );
}
