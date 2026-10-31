'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button, Dialog } from '@cabzone/design-system';
import type { AdminRole, AdminUserDetailDto, AdminUserSummaryDto } from '@cabzone/contracts';
import { useZones } from '@/features/zones/hooks/useZones';
import { useUpdateAdmin } from '../hooks/useAdmins';
import { Check, ChevronDown, MapPin } from 'lucide-react';

interface AdminEditDialogProps {
  admin: AdminUserSummaryDto | AdminUserDetailDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface RoleOption {
  role: AdminRole;
  label: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    role: 'CITY_ADMIN',
    label: 'Admin — runs operations',
  },
  {
    role: 'SUPER_ADMIN',
    label: 'Super admin — also manages admins and deletes accounts',
  },
  {
    role: 'SUPPORT_ADMIN',
    label: 'Support — handles customer and driver issues',
  },
  {
    role: 'FINANCE_ADMIN',
    label: 'Finance — manages wallets, ledgers and payouts',
  },
];

export function AdminEditDialog({
  admin,
  open,
  onOpenChange,
  onSuccess,
}: AdminEditDialogProps) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<AdminRole>('CITY_ADMIN');
  const [selectedZoneIds, setSelectedZoneIds] = useState<string[]>([]);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: zonesData } = useZones();
  const availableZones = useMemo(() => zonesData?.zones ?? [], [zonesData?.zones]);

  useEffect(() => {
    if (admin) {
      setName(admin.name ?? '');
      setRole(admin.role);
      setSelectedZoneIds(admin.cityZoneIds && admin.cityZoneIds.length > 0 ? admin.cityZoneIds : availableZones.map((z) => z.id));
      setIsRoleDropdownOpen(false);
      setFormError(null);
    }
  }, [admin, open, availableZones]);

  // Close dropdown on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsRoleDropdownOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isRoleDropdownOpen) {
        setIsRoleDropdownOpen(false);
      }
    };
    if (isRoleDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isRoleDropdownOpen]);

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
      setFormError('Full name is required.');
      return;
    }

    updateMutation.mutate({
      id: admin.id,
      body: {
        name: name.trim(),
        role,
        cityZoneIds: role === 'CITY_ADMIN' ? selectedZoneIds : [],
      },
    });
  };

  if (!admin) return null;

  const selectedRoleOption = ROLE_OPTIONS.find((r) => r.role === role) ?? ROLE_OPTIONS[0]!;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit admin"
      description="Changes here are recorded against your admin account."
      className="max-w-md rounded-2xl border border-border-strong bg-surface shadow-2xl"
      bodyClassName="overflow-visible"
      footer={
        <div className="flex w-full justify-between items-center pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={updateMutation.isPending}
            className="rounded-xl px-4 py-2 text-sm font-medium border border-border bg-surface text-text hover:bg-surface-muted"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-admin-form"
            variant="primary"
            disabled={updateMutation.isPending}
            className="rounded-xl px-5 py-2 text-sm font-semibold bg-interactive hover:bg-interactive-hover text-white shadow-xs"
          >
            {updateMutation.isPending ? 'Saving changes...' : 'Save changes'}
          </Button>
        </div>
      }
    >
      <form id="edit-admin-form" onSubmit={handleSubmit} className="space-y-4 pt-1">
        {formError && (
          <div className="p-3 text-xs bg-danger/10 border border-danger/30 text-danger rounded-xl font-medium leading-relaxed">
            {formError}
          </div>
        )}

        {updateMutation.isError && (
          <div className="p-3 text-xs bg-danger/10 border border-danger/30 text-danger rounded-xl font-medium leading-relaxed">
            {(updateMutation.error as Error)?.message || 'Failed to update admin.'}
          </div>
        )}

        {/* Full name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-admin-name" className="text-sm font-semibold text-text">
            Full name
          </label>
          <input
            id="edit-admin-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Biswajit Chaudhary"
            required
            className="h-11 w-full px-3.5 rounded-xl text-sm bg-surface text-text font-normal border border-border-strong hover:border-interactive focus:border-interactive focus:ring-2 focus:ring-interactive/20 outline-none transition-colors"
          />
        </div>

        {/* Role Custom Dropdown */}
        <div className="flex flex-col gap-1.5" ref={dropdownRef}>
          <label htmlFor="edit-role-dropdown-btn" className="text-sm font-semibold text-text">
            Role
          </label>
          <div className="relative">
            <button
              id="edit-role-dropdown-btn"
              type="button"
              aria-label="Role selection"
              aria-expanded={isRoleDropdownOpen}
              onClick={() => setIsRoleDropdownOpen((prev) => !prev)}
              className="w-full h-11 px-3.5 flex items-center justify-between text-left text-sm bg-surface border border-border-strong rounded-xl text-text hover:border-interactive transition-colors focus-visible:outline-2 focus-visible:outline-interactive cursor-pointer"
            >
              <span className="truncate font-normal text-text">{selectedRoleOption.label}</span>
              <ChevronDown
                className={`size-4 text-text transition-transform duration-200 shrink-0 ml-2 ${
                  isRoleDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isRoleDropdownOpen && (
              <div className="absolute left-0 right-0 bottom-full mb-1.5 z-50 bg-surface border border-border-strong rounded-xl shadow-2xl overflow-y-auto max-h-60 py-1 animate-in fade-in duration-100 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {ROLE_OPTIONS.map((opt) => {
                  const isSelected = opt.role === role;
                  return (
                    <button
                      key={opt.role}
                      type="button"
                      onClick={() => {
                        setRole(opt.role);
                        setIsRoleDropdownOpen(false);
                      }}
                      className={`w-full px-3.5 py-2.5 flex items-center justify-between text-left text-sm transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-surface-muted text-text font-medium'
                          : 'text-text hover:bg-surface-muted/60'
                      }`}
                    >
                      <span className="pr-4 leading-relaxed">{opt.label}</span>
                      {isSelected && <Check className="size-4 text-interactive shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Operational City Zone Assignment when role is CITY_ADMIN */}
        {role === 'CITY_ADMIN' && availableZones.length > 0 && (
          <div className="pt-1 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-text flex items-center gap-1.5">
                <MapPin className="size-3.5 text-interactive" />
                Operational Cities
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedZoneIds.length === availableZones.length) {
                      setSelectedZoneIds([]);
                    } else {
                      setSelectedZoneIds(availableZones.map((z) => z.id));
                    }
                  }}
                  className="text-xs text-interactive hover:underline font-semibold cursor-pointer"
                >
                  {selectedZoneIds.length === availableZones.length ? 'Clear all' : 'Select all'}
                </button>
                <span className="text-xs text-text-subtle font-mono">
                  {selectedZoneIds.length} / {availableZones.length} selected
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2.5 border border-border-strong rounded-xl bg-surface-sunken [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {availableZones.map((z) => {
                const isSelected = selectedZoneIds.includes(z.id);
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => handleZoneToggle(z.id)}
                    className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-interactive text-white border-interactive font-semibold shadow-xs'
                        : 'bg-surface text-text border-border-strong hover:bg-surface-muted'
                    }`}
                  >
                    <Check className={`size-3 shrink-0 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                    <span>{z.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </form>
    </Dialog>
  );
}
