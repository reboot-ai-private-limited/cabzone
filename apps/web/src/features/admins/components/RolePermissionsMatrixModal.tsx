'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Search,
  KeyRound,
} from 'lucide-react';
import { Button, Dialog } from '@cabzone/design-system';
import type { AdminRole, AdminRolePermissionDto } from '@cabzone/contracts';
import { useRolePermissions } from '../hooks/useAdmins';
import { AdminRoleBadge } from './AdminRoleBadge';

interface RolePermissionsMatrixModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FALLBACK_PERMISSIONS: AdminRolePermissionDto[] = [
  {
    role: 'SUPER_ADMIN',
    title: 'Super Administrator',
    description:
      'Full master privileges across platform configurations, regional zones, pricing engine, driver onboarding, finance adjustments, and staff management.',
    tier: 'SYSTEM',
    permissions: [
      {
        module: 'Staff Management',
        action: 'Manage Admins',
        description: 'Create, edit, suspend, and assign roles to administrative staff',
      },
      {
        module: 'Geography',
        action: 'Zone Control Plane',
        description: 'Create, modify, boundary repair, and deactivate geographic zones',
      },
      {
        module: 'Pricing',
        action: 'Pricing Configuration',
        description: 'Define base rates, per-km rates, tier multipliers, and surge policies',
      },
      {
        module: 'Fleet & KYC',
        action: 'Approve & Suspend Drivers',
        description: 'Review applications, manage document verifications, inspect fleet',
      },
      {
        module: 'Finance & Ledger',
        action: 'Wallet Adjustments',
        description: 'Manual credit/debit adjustments, balance audits, refund authorizations',
      },
      {
        module: 'Dispatch',
        action: 'Live Operations',
        description: 'Live tracking, override dispatches, force cancellations with reason',
      },
    ],
  },
  {
    role: 'CITY_ADMIN',
    title: 'City / Regional Administrator',
    description:
      'Territory-scoped administrator limited to managing driver operations, local coverage zones, and application reviews within explicitly assigned city zones.',
    tier: 'REGIONAL',
    permissions: [
      {
        module: 'Fleet & KYC',
        action: 'Approve & Review Drivers',
        description: 'Verify local driver documents and onboard drivers within assigned zones',
      },
      {
        module: 'Geography',
        action: 'View & Monitor Zones',
        description: 'Inspect boundaries, demand heatmaps, and coverage requests for assigned territory',
      },
      {
        module: 'Dispatch',
        action: 'Local Dispatch Assistance',
        description: 'Monitor live trips and assist local drivers with dispatch issues',
      },
      {
        module: 'Pricing',
        action: 'View City Rate Cards',
        description: 'Inspect active pricing rules without authority to edit base tariffs',
      },
    ],
  },
  {
    role: 'SUPPORT_ADMIN',
    title: 'Customer & Driver Support',
    description:
      'First-line operational and support specialist focused on resolving rider complaints, reviewing customer accounts, and unblocking driver onboarding inquiries.',
    tier: 'OPERATIONS',
    permissions: [
      {
        module: 'Customer Support',
        action: 'Rider Accounts',
        description: 'Inspect rider dossiers, verify emergency contacts, and suspend suspicious riders',
      },
      {
        module: 'Driver Support',
        action: 'Onboarding Helpdesk',
        description: 'Inspect document rejections and advise drivers on KYC compliance',
      },
      {
        module: 'Dispatch',
        action: 'Trip Timeline & Audit',
        description: 'Review trip events, geofence logs, and fare breakdown receipts',
      },
    ],
  },
  {
    role: 'FINANCE_ADMIN',
    title: 'Finance & Accounts Manager',
    description:
      'Financial oversight manager responsible for driver wallet reconciliations, manual credit/debit adjustments, settlement reviews, and pricing simulator testing.',
    tier: 'FINANCE',
    permissions: [
      {
        module: 'Finance & Ledger',
        action: 'Driver Wallets',
        description: 'Inspect live driver ledger balances, deposits, and commission deductions',
      },
      {
        module: 'Finance & Ledger',
        action: 'Manual Adjustments',
        description: 'Post credit or debit wallet adjustments with required audit reason',
      },
      {
        module: 'Pricing',
        action: 'Fare Simulator',
        description: 'Verify route rate cards, toll calculations, and state border crossing estimates',
      },
      {
        module: 'Finance & Ledger',
        action: 'Settlements & Payouts',
        description: 'Audit payout requests and batch bank reconciliation exports',
      },
    ],
  },
];

export function RolePermissionsMatrixModal({
  open,
  onOpenChange,
}: RolePermissionsMatrixModalProps) {
  const { data: remoteData } = useRolePermissions();
  const permissionsData = remoteData && remoteData.length > 0 ? remoteData : FALLBACK_PERMISSIONS;

  const [selectedRole, setSelectedRole] = useState<AdminRole | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Extract unique modules
  const allModules = Array.from(
    new Set(
      permissionsData.flatMap((r) => r.permissions.map((p) => p.module)),
    ),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Staff Role Permissions & Privilege Matrix"
      description="Role-Based Access Control (RBAC) authorization matrix governing administrative operations"
      className="max-w-4xl max-h-[85vh] overflow-y-auto"
      footer={
        <div className="flex w-full justify-between items-center text-xs text-muted-foreground">
          <span>Enterprise RBAC Engine • Cabzone Multi-Tenant Security</span>
          <Button size="sm" variant="secondary" onClick={() => onOpenChange(false)}>
            Close Matrix
          </Button>
        </div>
      }
    >
      <div className="space-y-6 pt-2">
        {/* Role Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {permissionsData.map((role) => {
            const isSelected = selectedRole === role.role;
            return (
              <button
                key={role.role}
                type="button"
                onClick={() => setSelectedRole(isSelected ? 'ALL' : role.role)}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'border-primary ring-2 ring-primary/20 bg-primary/5 shadow-sm'
                    : 'border-border hover:border-primary/40 bg-card hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <AdminRoleBadge role={role.role} />
                  <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {role.tier}
                  </span>
                </div>
                <h4 className="text-xs font-semibold text-foreground mb-1 line-clamp-1">
                  {role.title}
                </h4>
                <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                  {role.description}
                </p>
                <div className="mt-2.5 pt-2 border-t border-border/50 text-[11px] font-medium text-foreground flex items-center justify-between">
                  <span>Capabilities</span>
                  <span className="font-semibold text-primary">{role.permissions.length} actions</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex items-center justify-between gap-3 bg-muted/30 p-2.5 rounded-lg border border-border/60">
          <div className="relative flex-1">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search actions, modules, or security scopes (e.g. wallet, kyc, pricing)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-background rounded-md border border-input focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {selectedRole !== 'ALL' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedRole('ALL')}
              className="text-xs h-8"
            >
              Show All Roles
            </Button>
          )}
        </div>

        {/* Modules Permission Details */}
        <div className="space-y-4">
          {allModules.map((moduleName) => {
            // Find all unique actions in this module
            const moduleActions = Array.from(
              new Set(
                permissionsData
                  .flatMap((r) => r.permissions)
                  .filter((p) => p.module === moduleName)
                  .map((p) => p.action),
              ),
            );

            // Filter actions matching search term
            const filteredActions = moduleActions.filter((actionName) => {
              if (!searchTerm) return true;
              const term = searchTerm.toLowerCase();
              if (moduleName.toLowerCase().includes(term)) return true;
              if (actionName.toLowerCase().includes(term)) return true;
              const desc = permissionsData
                .flatMap((r) => r.permissions)
                .find((p) => p.action === actionName)?.description;
              return desc?.toLowerCase().includes(term) ?? false;
            });

            if (filteredActions.length === 0) return null;

            return (
              <div
                key={moduleName}
                className="rounded-xl border border-border overflow-hidden bg-card"
              >
                <div className="bg-muted/40 px-4 py-2.5 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <KeyRound className="size-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground tracking-wide uppercase">
                      {moduleName}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {filteredActions.length} {filteredActions.length === 1 ? 'privilege' : 'privileges'}
                  </span>
                </div>

                <div className="divide-y divide-border/60">
                  {filteredActions.map((actionName) => {
                    // Find which roles have this action
                    const authorizedRoles = permissionsData.filter((r) =>
                      r.permissions.some((p) => p.action === actionName),
                    );

                    // If a specific role is selected, check if this action is in that role
                    if (
                      selectedRole !== 'ALL' &&
                      !authorizedRoles.some((r) => r.role === selectedRole)
                    ) {
                      return null;
                    }

                    const sampleDesc =
                      authorizedRoles[0]?.permissions.find((p) => p.action === actionName)
                        ?.description ?? '';

                    return (
                      <div
                        key={actionName}
                        className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                      >
                        <div className="space-y-0.5 max-w-md">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">
                              {actionName}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            {sampleDesc}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {permissionsData.map((role) => {
                            const isAuthorized = role.permissions.some(
                              (p) => p.action === actionName,
                            );

                            if (selectedRole !== 'ALL' && role.role !== selectedRole) {
                              return null;
                            }

                            return (
                              <div
                                key={role.role}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium border ${
                                  isAuthorized
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800'
                                    : 'bg-muted/30 text-muted-foreground border-border/40 opacity-40'
                                }`}
                              >
                                {isAuthorized ? (
                                  <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />
                                ) : (
                                  <XCircle className="size-3 text-muted-foreground" />
                                )}
                                <span>{role.title.split(' ')[0]}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}
