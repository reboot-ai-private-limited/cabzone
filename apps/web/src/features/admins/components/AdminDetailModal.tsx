'use client';

import { useState } from 'react';
import {
  Building2,
  Calendar,
  Check,
  Copy,
  Edit2,
  Globe,
  KeyRound,
  Mail,
  MapPin,
  Shield,
  ShieldAlert,
  User,
  UserCheck,
  UserX,
} from 'lucide-react';
import { Badge, Button, Dialog, Skeleton, StatTile } from '@cabzone/design-system';
import type { AdminUserDetailDto, AdminUserSummaryDto } from '@cabzone/contracts';
import { useAdminDetail } from '../hooks/useAdmins';
import { AdminRoleBadge } from './AdminRoleBadge';
import { AdminStatusBadge } from './AdminStatusBadge';
import { AdminEditDialog } from './AdminEditDialog';
import { AdminStatusDialog } from './AdminStatusDialog';

interface AdminDetailModalProps {
  adminId: string | null;
  initialAdmin?: AdminUserSummaryDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh?: () => void;
}

export function AdminDetailModal({
  adminId,
  initialAdmin,
  open,
  onOpenChange,
  onRefresh,
}: AdminDetailModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);

  const { data: detailData, isLoading, refetch } = useAdminDetail(open ? adminId : null);

  const admin: AdminUserDetailDto | AdminUserSummaryDto | null =
    detailData ?? initialAdmin ?? null;

  const handleCopy = (text: string, field: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const handleUpdated = () => {
    refetch();
    onRefresh?.();
  };

  const resolvedCityZones = (admin as AdminUserDetailDto)?.cityZones;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="Admin Details"
        description="Administrator profile and permissions"
        className="max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl border border-border-strong bg-surface shadow-2xl"
        footer={
          <div className="flex w-full items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              {admin && (
                <Button
                  size="sm"
                  variant={admin.status === 'SUSPENDED' ? 'primary' : 'danger'}
                  onClick={() => setIsStatusOpen(true)}
                  className="rounded-xl px-4 font-semibold"
                >
                  {admin.status === 'SUSPENDED' ? (
                    <>
                      <UserCheck className="size-4 mr-1.5" />
                      Reactivate
                    </>
                  ) : (
                    <>
                      <UserX className="size-4 mr-1.5" />
                      Suspend
                    </>
                  )}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setIsEditOpen(true)}
                disabled={!admin}
                className="rounded-xl px-4 font-semibold"
              >
                <Edit2 className="size-3.5 mr-1.5" />
                Edit Admin
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="rounded-xl px-3"
              >
                Close
              </Button>
            </div>
          </div>
        }
      >
        {isLoading && !admin ? (
          <div className="space-y-6 py-4">
            <div className="flex items-center gap-4">
              <Skeleton className="size-16 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
            </div>
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : !admin ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            Administrator record could not be found or loaded.
          </div>
        ) : (
          <div className="space-y-6 pt-2">
            {/* Header Hero Card */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-border bg-gradient-to-r from-card to-muted/30">
              <div className="flex items-center gap-4">
                <div className="size-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xl border border-primary/20 shadow-sm shrink-0">
                  {admin.name
                    ? admin.name
                        .split(' ')
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()
                    : 'AD'}
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-lg font-bold text-foreground tracking-tight">
                      {admin.name ?? 'Unnamed Staff Member'}
                    </h3>
                    <AdminRoleBadge role={admin.role} />
                    <AdminStatusBadge status={admin.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    <span className="font-mono">ID: {admin.id.slice(0, 8)}</span>
                    {admin.email && (
                      <span className="flex items-center gap-1.5">
                        <Mail className="size-3.5 text-primary" />
                        {admin.email}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex sm:flex-col items-end gap-1.5 text-xs text-muted-foreground pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
                <span className="flex items-center gap-1 text-[11px]">
                  <Calendar className="size-3" />
                  Provisioned: {new Date(admin.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
                <span className="text-[10px] text-muted-foreground/80 font-mono">
                  ID: {admin.id.slice(0, 8)}...
                </span>
              </div>
            </div>

            {/* Quick Stat Tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatTile
                label="Role Category"
                value={
                  admin.role === 'SUPER_ADMIN'
                    ? 'Global Master'
                    : admin.role === 'CITY_ADMIN'
                      ? 'Territory Scope'
                      : admin.role === 'FINANCE_ADMIN'
                        ? 'Ledger & Audit'
                        : 'Operations'
                }
                icon={<Shield className="size-4 text-primary" />}
                hint={
                  admin.role === 'SUPER_ADMIN'
                    ? 'Unrestricted authorization'
                    : 'Scoped administrative rights'
                }
                tone="default"
              />
              <StatTile
                label="Territory Coverage"
                value={
                  admin.role === 'SUPER_ADMIN'
                    ? 'All Zones'
                    : `${admin.cityZoneIds.length} ${
                        admin.cityZoneIds.length === 1 ? 'Zone' : 'Zones'
                      }`
                }
                icon={<Globe className="size-4 text-blue-600" />}
                hint={
                  admin.role === 'SUPER_ADMIN'
                    ? 'Global cross-border authority'
                    : 'Assigned regional jurisdiction'
                }
                tone={admin.cityZoneIds.length > 0 || admin.role === 'SUPER_ADMIN' ? 'success' : 'default'}
              />
              <StatTile
                label="Account Health"
                value={admin.status === 'ACTIVE' ? 'Active' : 'Suspended'}
                icon={<KeyRound className="size-4 text-emerald-600" />}
                hint={
                  admin.status === 'ACTIVE'
                    ? 'Console sign-in enabled'
                    : 'Sessions revoked / access blocked'
                }
                tone={admin.status === 'ACTIVE' ? 'success' : 'danger'}
              />
            </div>

            {/* Assigned Territory Section */}
            <div className="p-4 rounded-xl border border-border bg-card space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 text-primary" />
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Geographic Jurisdiction & Assigned Zones
                  </h4>
                </div>
                <span className="text-xs text-muted-foreground font-medium">
                  {admin.role === 'SUPER_ADMIN'
                    ? 'Platform Wide'
                    : `${admin.cityZoneIds.length} assigned`}
                </span>
              </div>

              {admin.role === 'SUPER_ADMIN' ? (
                <div className="p-3 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-800/40 rounded-lg flex items-center gap-3">
                  <ShieldAlert className="size-5 text-purple-600 shrink-0" />
                  <p className="text-xs text-purple-900 dark:text-purple-200 leading-relaxed">
                    Super Administrators possess universal territorial access. They can configure pricing,
                    inspect fleet metrics, and manage dispatch across all active regional zones nationwide.
                  </p>
                </div>
              ) : resolvedCityZones && resolvedCityZones.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {resolvedCityZones.map((z) => (
                    <div
                      key={z.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/30 text-xs text-foreground font-medium"
                    >
                      <Building2 className="size-3.5 text-blue-600" />
                      <span>{z.name}</span>
                      {z.code && (
                        <span className="text-[10px] text-muted-foreground font-mono bg-background px-1 py-0.5 rounded border border-border/50">
                          {z.code}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : admin.cityZoneIds.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {admin.cityZoneIds.map((zoneId) => (
                    <Badge key={zoneId} tone="info">
                      <MapPin className="size-3 mr-1" />
                      Zone: {zoneId.slice(0, 8)}...
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground italic p-3 bg-muted/20 rounded-lg">
                  No regional zones currently assigned.
                  {admin.role === 'CITY_ADMIN' && ' (Please edit profile to assign operational city zones)'}
                </div>
              )}
            </div>

            {/* Technical Identifiers */}
            <div className="p-4 rounded-xl border border-border bg-card space-y-3">
              <div className="flex items-center gap-2">
                <User className="size-4 text-primary" />
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Security Credentials & Identifiers
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-muted/30 rounded-lg border border-border/50 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase font-mono text-muted-foreground">
                      Admin Record ID
                    </span>
                    <p className="font-mono text-xs text-foreground">{admin.id}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="size-8 p-0"
                    onClick={() => handleCopy(admin.id, 'adminId')}
                  >
                    {copiedField === 'adminId' ? (
                      <Check className="size-3.5 text-success" />
                    ) : (
                      <Copy className="size-3.5 text-muted-foreground" />
                    )}
                  </Button>
                </div>

                <div className="p-3 bg-muted/30 rounded-lg border border-border/50 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase font-mono text-muted-foreground">
                      Underlying User ID
                    </span>
                    <p className="font-mono text-xs text-foreground">{admin.userId}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="size-8 p-0"
                    onClick={() => handleCopy(admin.userId, 'userId')}
                  >
                    {copiedField === 'userId' ? (
                      <Check className="size-3.5 text-success" />
                    ) : (
                      <Copy className="size-3.5 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* Edit Dialog */}
      <AdminEditDialog
        admin={admin}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSuccess={handleUpdated}
      />

      {/* Status Dialog */}
      <AdminStatusDialog
        admin={admin}
        open={isStatusOpen}
        onOpenChange={setIsStatusOpen}
        onSuccess={handleUpdated}
      />
    </>
  );
}
