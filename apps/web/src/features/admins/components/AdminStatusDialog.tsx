'use client';

import { useState } from 'react';
import { AlertTriangle, UserCheck } from 'lucide-react';
import { Button, Dialog } from '@cabzone/design-system';
import type { AdminUserDetailDto, AdminUserSummaryDto } from '@cabzone/contracts';
import { useUpdateAdminStatus } from '../hooks/useAdmins';

interface AdminStatusDialogProps {
  admin: AdminUserSummaryDto | AdminUserDetailDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AdminStatusDialog({
  admin,
  open,
  onOpenChange,
  onSuccess,
}: AdminStatusDialogProps) {
  const [reason, setReason] = useState('');

  const statusMutation = useUpdateAdminStatus(() => {
    onOpenChange(false);
    setReason('');
    onSuccess?.();
  });

  if (!admin) return null;

  const isSuspending = admin.status === 'ACTIVE';
  const targetStatus = isSuspending ? 'SUSPENDED' : 'ACTIVE';

  const handleConfirm = () => {
    statusMutation.mutate({
      id: admin.id,
      body: {
        status: targetStatus,
        reason: reason.trim() || undefined,
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setReason('');
        onOpenChange(v);
      }}
      title={isSuspending ? 'Suspend Admin' : 'Reactivate Admin'}
      className="max-w-md rounded-2xl border border-border-strong bg-surface shadow-2xl"
      footer={
        <div className="flex w-full justify-between items-center pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={statusMutation.isPending}
            className="rounded-xl px-4 py-2 text-sm font-medium border border-border bg-surface text-text hover:bg-surface-muted"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={isSuspending ? 'danger' : 'primary'}
            onClick={handleConfirm}
            disabled={statusMutation.isPending}
            className={`rounded-xl px-5 py-2 text-sm font-semibold text-white shadow-xs ${
              isSuspending ? 'bg-danger hover:bg-danger/90' : 'bg-interactive hover:bg-interactive-hover'
            }`}
          >
            {statusMutation.isPending
              ? isSuspending
                ? 'Suspending...'
                : 'Reactivating...'
              : isSuspending
                ? 'Suspend'
                : 'Reactivate'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <div
          className={`p-3.5 rounded-xl border flex items-start gap-3 ${
            isSuspending
              ? 'bg-danger/10 border-danger/30 text-danger'
              : 'bg-interactive/10 border-interactive/30 text-text'
          }`}
        >
          {isSuspending ? (
            <AlertTriangle className="size-5 text-danger shrink-0 mt-0.5" />
          ) : (
            <UserCheck className="size-5 text-interactive shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-text">
              {isSuspending
                ? `Suspend ${admin.name ?? admin.email ?? `Admin #${admin.id.slice(0, 8)}`}?`
                : `Reactivate ${admin.name ?? admin.email ?? `Admin #${admin.id.slice(0, 8)}`}?`}
            </h4>
            <p className="text-xs text-text-subtle leading-relaxed">
              {isSuspending
                ? 'This will immediately revoke active sessions and disable console login.'
                : 'This will restore full console sign-in and permissions.'}
            </p>
          </div>
        </div>

        {statusMutation.isError && (
          <div className="p-3 text-xs bg-danger/10 border border-danger/20 text-danger rounded-lg leading-relaxed">
            {(statusMutation.error as Error)?.message || 'Failed to update account status.'}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="status-reason-input" className="text-sm font-semibold text-text">
            Reason (optional)
          </label>
          <input
            id="status-reason-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              isSuspending
                ? 'Reason for suspension'
                : 'Reason for reactivation'
            }
            className="h-11 w-full px-3.5 rounded-xl text-sm bg-surface text-text font-normal border border-border-strong hover:border-interactive focus:border-interactive focus:ring-2 focus:ring-interactive/20 outline-none transition-colors"
          />
        </div>
      </div>
    </Dialog>
  );
}
