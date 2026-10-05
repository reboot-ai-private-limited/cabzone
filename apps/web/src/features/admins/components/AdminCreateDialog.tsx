'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Button, Dialog, FormField, Input } from '@cabzone/design-system';
import type { AdminRole } from '@cabzone/contracts';
import { useZones } from '@/features/zones/hooks/useZones';
import { useCreateAdmin } from '../hooks/useAdmins';
import { ChevronDown, Check, MapPin } from 'lucide-react';

interface AdminCreateDialogProps {
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

export function AdminCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: AdminCreateDialogProps) {
  const [phoneE164, setPhoneE164] = useState('+91');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('CITY_ADMIN');
  const [selectedZoneIds, setSelectedZoneIds] = useState<string[]>([]);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: zonesData } = useZones();
  const availableZones = useMemo(() => zonesData?.zones ?? [], [zonesData?.zones]);

  // Select all zones by default whenever dialog opens or zones load
  useEffect(() => {
    if (open && availableZones.length > 0) {
      setSelectedZoneIds(availableZones.map((z) => z.id));
    }
  }, [open, availableZones]);

  const createMutation = useCreateAdmin(() => {
    onOpenChange(false);
    resetForm();
    onSuccess?.();
  });

  const resetForm = () => {
    setPhoneE164('+91');
    setName('');
    setPassword('');
    setEmail('');
    setRole('CITY_ADMIN');
    setSelectedZoneIds(availableZones.map((z) => z.id));
    setIsRoleDropdownOpen(false);
    setFormError(null);
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsRoleDropdownOpen(false);
      }
    };
    if (isRoleDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isRoleDropdownOpen]);

  const handleZoneToggle = (zoneId: string) => {
    setSelectedZoneIds((prev) =>
      prev.includes(zoneId) ? prev.filter((id) => id !== zoneId) : [...prev, zoneId],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedPhone = phoneE164.trim();
    if (!/^\+[1-9]\d{6,14}$/.test(trimmedPhone)) {
      setFormError('International format required, e.g. +919876543210');
      return;
    }

    if (!name.trim()) {
      setFormError('Full name is required.');
      return;
    }

    if (password && password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }

    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError('Please enter a valid email address.');
      return;
    }

    createMutation.mutate({
      phoneE164: trimmedPhone,
      name: name.trim(),
      email: email.trim() || undefined,
      password: password.trim() || undefined,
      role,
      cityZoneIds: role === 'CITY_ADMIN' ? selectedZoneIds : [],
    });
  };

  const selectedRoleOption = ROLE_OPTIONS.find((r) => r.role === role) ?? ROLE_OPTIONS[0]!;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
      title="Add admin"
      description="They sign in with this mobile number and password. Nothing is sent until they try."
      className="max-w-md"
      footer={
        <div className="flex w-full justify-between items-center pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-admin-form"
            variant="primary"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Adding admin...' : 'Add admin'}
          </Button>
        </div>
      }
    >
      <form id="add-admin-form" onSubmit={handleSubmit} className="space-y-4 pt-1">
        {formError && (
          <div className="p-3 text-xs bg-danger/10 border border-danger/20 text-danger rounded-lg leading-relaxed">
            {formError}
          </div>
        )}

        {createMutation.isError && (
          <div className="p-3 text-xs bg-danger/10 border border-danger/20 text-danger rounded-lg leading-relaxed">
            {(createMutation.error as Error)?.message || 'Failed to create admin.'}
          </div>
        )}

        {/* Mobile Number */}
        <FormField label="Mobile number" hint="International format, e.g. +919876543210">
          {({ id, invalid, describedBy }) => (
            <Input
              id={id}
              invalid={invalid}
              aria-describedby={describedBy}
              value={phoneE164}
              onChange={(e) => setPhoneE164(e.target.value)}
              placeholder="+919876543210"
              required
              className="h-11 rounded-lg font-mono text-sm"
            />
          )}
        </FormField>

        {/* Full Name */}
        <FormField label="Full name">
          {({ id, invalid, describedBy }) => (
            <Input
              id={id}
              invalid={invalid}
              aria-describedby={describedBy}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Vikram Sharma"
              required
              className="h-11 rounded-lg text-sm"
            />
          )}
        </FormField>

        {/* Password */}
        <FormField label="Password" hint="At least 6 characters for console sign-in">
          {({ id, invalid, describedBy }) => (
            <Input
              id={id}
              invalid={invalid}
              aria-describedby={describedBy}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter initial password"
              className="h-11 rounded-lg text-sm"
            />
          )}
        </FormField>

        {/* Role Custom Dropdown matching the UI screenshot */}
        <div className="space-y-1.5" ref={dropdownRef}>
          <span className="block text-xs font-semibold text-text">Role</span>
          <div className="relative">
            <button
              id="role-dropdown-btn"
              type="button"
              aria-label="Role selection"
              aria-expanded={isRoleDropdownOpen}
              onClick={() => setIsRoleDropdownOpen((prev) => !prev)}
              className="w-full h-10 px-3 flex items-center justify-between text-left text-xs sm:text-sm bg-surface border border-border-strong rounded-md text-text hover:border-interactive transition-colors focus-visible:outline-2 focus-visible:outline-interactive cursor-pointer"
            >
              <span className="truncate font-medium">
                {selectedRoleOption.label}
              </span>
              <ChevronDown
                className={`size-4 text-text-subtle transition-transform duration-200 shrink-0 ml-2 ${
                  isRoleDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isRoleDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-surface border border-border-strong rounded-md shadow-2xl overflow-hidden py-1 animate-in fade-in duration-100">
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
                      className={`w-full px-3 py-2.5 flex items-center justify-between text-left text-xs transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-surface-muted text-text font-semibold'
                          : 'text-text hover:bg-surface-muted/60'
                      }`}
                    >
                      <span className="pr-4 leading-relaxed">{opt.label}</span>
                      {isSelected && (
                        <Check className="size-4 text-interactive shrink-0" />
                      )}
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
              <span className="font-medium text-text flex items-center gap-1.5">
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
                  className="text-[11px] text-interactive hover:underline font-medium cursor-pointer"
                >
                  {selectedZoneIds.length === availableZones.length ? 'Clear all' : 'Select all'}
                </button>
                <span className="text-[11px] text-text-subtle font-mono">
                  {selectedZoneIds.length} / {availableZones.length} selected
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 border border-border rounded-md bg-surface-sunken">
              {availableZones.map((z) => {
                const isSelected = selectedZoneIds.includes(z.id);
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => handleZoneToggle(z.id)}
                    className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-interactive text-white border-interactive font-medium shadow-xs'
                        : 'bg-surface text-text border-border hover:bg-surface-muted hover:border-border-strong'
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
