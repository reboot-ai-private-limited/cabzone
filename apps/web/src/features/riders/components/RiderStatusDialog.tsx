'use client';

import { ConfirmDialog } from '@cabzone/design-system';
import type { AdminRiderSummaryDto } from '@cabzone/contracts';
import { useUpdateRiderStatus } from '../hooks/useRiders';

interface RiderStatusDialogProps {
  rider: AdminRiderSummaryDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function RiderStatusDialog({
  rider,
  open,
  onOpenChange,
  onSuccess,
}: RiderStatusDialogProps) {
  const updateStatusMutation = useUpdateRiderStatus(() => {
    onOpenChange(false);
    onSuccess?.();
  });

  if (!rider) return null;

  const isSuspended = rider.status === 'SUSPENDED';
  const targetStatus = isSuspended ? 'ACTIVE' : 'SUSPENDED';

  const riderLabel = rider.name || `Customer #${rider.id.slice(0, 8)}`;
  const consequences = isSuspended
    ? [
        `Restores account access for ${riderLabel}`,
        'Allows the customer to log into the mobile app and book rides',
      ]
    : [
        `Immediately revokes all active login sessions for ${riderLabel}`,
        'Prevents the customer from logging in or requesting new rides',
        'Existing trip records and invoice histories are preserved intact',
      ];

  const handleConfirm = () => {
    updateStatusMutation.mutate({
      id: rider.id,
      body: { status: targetStatus },
    });
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isSuspended ? 'Reactivate Customer Account?' : 'Suspend Customer Account?'}
      confirmLabel={isSuspended ? 'Reactivate Account' : 'Suspend Account'}
      variant={isSuspended ? 'primary' : 'danger'}
      loading={updateStatusMutation.isPending}
      onConfirm={handleConfirm}
      consequences={consequences}
    />
  );
}
