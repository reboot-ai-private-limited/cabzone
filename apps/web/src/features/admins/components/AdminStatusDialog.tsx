'use client';

import { useState } from 'react';
import { AlertTriangle, UserCheck } from 'lucide-react';
import { Button, Dialog, FormField, Input } from '@cabzone/design-system';
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
      title={isSuspending ? 'Suspend Administrator Account' : 'Reactivate Administrator Account'}
      className="max-w-md"
      footer={
        <div className="flex w-full justify-between items-center">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={statusMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={isSuspending ? 'danger' : 'primary'}
            onClick={handleConfirm}
            disabled={statusMutation.isPending}
          >
            {statusMutation.isPending
              ? isSuspending
                ? 'Suspending...'
                : 'Reactivating...'
              : isSuspending
                ? 'Confirm Suspension'
                : 'Confirm Reactivation'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 ${
            isSuspending
              ? 'bg-rose-50/50 border-rose-200 text-rose-900 dark:bg-rose-950/20 dark:border-rose-900 dark:text-rose-200'
              : 'bg-emerald-50/50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-200'
          }`}
        >
          {isSuspending ? (
            <AlertTriangle className="size-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          ) : (
            <UserCheck className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <h4 className="text-xs font-semibold">
              {isSuspending
                ? `Suspend access for ${admin.name ?? admin.phoneE164}?`
                : `Restore access for ${admin.name ?? admin.phoneE164}?`}
            </h4>
            <p className="text-[11px] leading-relaxed opacity-90">
              {isSuspending
                ? 'Suspending this operator will immediately revoke all active browser sessions, invalidate tokens, and terminate their access to the administrative control plane.'
                : 'Reactivating this staff member will allow them to log in via mobile OTP and resume operations according to their assigned role.'}
            </p>
          </div>
        </div>

        {statusMutation.isError && (
          <div className="p-3 text-xs bg-danger/10 border border-danger/20 text-danger rounded-lg leading-relaxed">
            {(statusMutation.error as Error)?.message || 'Failed to update account status.'}
          </div>
        )}

        <FormField label="Audit Reason" hint="Optional, recorded in the administrative security audit log">
          {({ id, invalid, describedBy }) => (
            <Input
              id={id}
              invalid={invalid}
              aria-describedby={describedBy}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                isSuspending
                  ? 'e.g. Protocol audit / Role reassignment'
                  : 'e.g. Audit cleared / Reinstatement approved'
              }
            />
          )}
        </FormField>
      </div>
    </Dialog>
  );
}
