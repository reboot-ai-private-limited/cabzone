'use client';

import { useState, useEffect } from 'react';
import { Button, Dialog, FormField, Input } from '@cabzone/design-system';
import type { AdminRole, AdminUserDetailDto, AdminUserSummaryDto } from '@cabzone/contracts';
import { useZones } from '@/features/zones/hooks/useZones';
import { useUpdateAdmin } from '../hooks/useAdmins';
import { ShieldAlert, Building2, Headphones, Wallet, MapPin, Check } from 'lucide-react';

interface AdminEditDialogProps {
  admin: AdminUserSummaryDto | AdminUserDetailDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const ROLES_INFO: Array<{
  role: AdminRole;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    role: 'SUPER_ADMIN',
    title: 'Super Administrator',
    description: 'Master platform privileges across global settings, zones, pricing, and all staff.',
    icon: <ShieldAlert className="size-4 text-purple-600" />,
  },
  {
    role: 'CITY_ADMIN',
    title: 'City / Regional Admin',
    description: 'Operational manager restricted to drivers and dispatch within assigned city zones.',
    icon: <Building2 className="size-4 text-blue-600" />,
  },
  {
    role: 'SUPPORT_ADMIN',
    title: 'Support Specialist',
    description: 'Customer and driver service desk agent managing tickets, disputes, and rider accounts.',
    icon: <Headphones className="size-4 text-emerald-600" />,
  },
  {
    role: 'FINANCE_ADMIN',
    title: 'Finance & Ledger Manager',
    description: 'Financial auditor managing wallet balances, manual adjustments, and settlement batches.',
    icon: <Wallet className="size-4 text-amber-600" />,
  },
];

export function AdminEditDialog({
  admin,
  open,
  onOpenChange,
  onSuccess,
}: AdminEditDialogProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('CITY_ADMIN');
  const [selectedZoneIds, setSelectedZoneIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: zonesData } = useZones();
  const availableZones = zonesData?.zones ?? [];

  useEffect(() => {
    if (admin) {
      setName(admin.name ?? '');
      setEmail(admin.email ?? '');
      setRole(admin.role);
      setSelectedZoneIds(admin.cityZoneIds ?? []);
      setFormError(null);
    }
  }, [admin, open]);

  const updateMutation = useUpdateAdmin(() => {
    onOpenChange(false);
    onSuccess?.();
  });

  const handleZoneToggle = (zoneId: string) => {
    setSelectedZoneIds((prev) =>
      prev.includes(zoneId) ? prev.filter((id) => id !== zoneId) : [...prev, zoneId],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!admin) return;
    setFormError(null);

    if (!name.trim()) {
      setFormError('Staff member full name is required.');
      return;
    }

    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError('Please provide a valid official email address.');
      return;
    }

    if (role === 'CITY_ADMIN' && selectedZoneIds.length === 0 && availableZones.length > 0) {
      setFormError('City Administrators must be assigned to at least one operational city zone.');
      return;
    }

    updateMutation.mutate({
      id: admin.id,
      body: {
        name: name.trim(),
        email: email.trim() || null,
        role,
        cityZoneIds: role === 'CITY_ADMIN' ? selectedZoneIds : [],
      },
    });
  };

  if (!admin) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Staff Member Details"
      description={`Update role, profile information, and territory scope for ${admin.name ?? admin.phoneE164}.`}
      className="max-w-2xl max-h-[90vh] overflow-y-auto"
      footer={
        <div className="flex w-full justify-between items-center">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={updateMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-admin-form"
            variant="primary"
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Saving Changes...' : 'Save Changes'}
          </Button>
        </div>
      }
    >
      <form id="edit-admin-form" onSubmit={handleSubmit} className="space-y-5 pt-1">
        {formError && (
          <div className="p-3 text-xs bg-danger/10 border border-danger/20 text-danger rounded-lg leading-relaxed">
            {formError}
          </div>
        )}

        {updateMutation.isError && (
          <div className="p-3 text-xs bg-danger/10 border border-danger/20 text-danger rounded-lg leading-relaxed">
            {(updateMutation.error as Error)?.message || 'Failed to update admin profile.'}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Mobile Phone (E.164)" hint="Phone number is immutable">
            {({ id, invalid, describedBy }) => (
              <Input
                id={id}
                invalid={invalid}
                aria-describedby={describedBy}
                value={admin.phoneE164}
                disabled
                className="opacity-60 cursor-not-allowed bg-muted"
              />
            )}
          </FormField>

          <FormField label="Full Name" required hint="Display name">
            {({ id, invalid, describedBy }) => (
              <Input
                id={id}
                invalid={invalid}
                aria-describedby={describedBy}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Vikramaditya Sharma"
                required
              />
            )}
          </FormField>
        </div>

        <FormField label="Official Email Address" hint="Audit reports and emergency notification recipient">
          {({ id, invalid, describedBy }) => (
            <Input
              id={id}
              invalid={invalid}
              aria-describedby={describedBy}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. vikram.ops@cabzone.in"
            />
          )}
        </FormField>

        {/* Role Selector */}
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-foreground">
            Administrative Role & Permissions <span className="text-danger">*</span>
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {ROLES_INFO.map((info) => {
              const isSelected = role === info.role;
              return (
                <button
                  key={info.role}
                  type="button"
                  onClick={() => setRole(info.role)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                      : 'border-border hover:border-primary/40 bg-card hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    {info.icon}
                    <span className="text-xs font-semibold text-foreground">{info.title}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                    {info.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Territory Assignment (Visible for CITY_ADMIN) */}
        {role === 'CITY_ADMIN' && (
          <div className="space-y-2.5 p-3.5 rounded-xl border border-blue-200/60 dark:border-blue-900/50 bg-blue-50/30 dark:bg-blue-950/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="size-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-semibold text-foreground">
                  Assigned Geographic Zones <span className="text-danger">*</span>
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {selectedZoneIds.length} {selectedZoneIds.length === 1 ? 'zone' : 'zones'} selected
              </span>
            </div>

            {availableZones.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                {availableZones.map((z) => {
                  const isChecked = selectedZoneIds.includes(z.id);
                  return (
                    <button
                      key={z.id}
                      type="button"
                      onClick={() => handleZoneToggle(z.id)}
                      className={`flex items-center justify-between p-2 rounded-lg border text-left text-xs transition-colors ${
                        isChecked
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border bg-background text-foreground hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex flex-col truncate pr-2">
                        <span className="truncate font-medium">{z.name}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{z.code}</span>
                      </div>
                      <div
                        className={`size-4 rounded flex items-center justify-center border ${
                          isChecked
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-muted-foreground/30'
                        }`}
                      >
                        {isChecked && <Check className="size-3" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground italic p-2 bg-muted/40 rounded">
                No active zones found.
              </div>
            )}
          </div>
        )}
      </form>
    </Dialog>
  );
}
