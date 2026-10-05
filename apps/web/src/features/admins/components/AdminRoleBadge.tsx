import React from 'react';
import type { AdminRole } from '@cabzone/contracts';
import { ShieldAlert, Building2, Headphones, Wallet } from 'lucide-react';

interface RoleStyle {
  label: string;
  icon: React.ReactNode;
  bg: string;
  text: string;
  border: string;
}

const ROLE_STYLES: Record<AdminRole, RoleStyle> = {
  SUPER_ADMIN: {
    label: 'Super Admin',
    icon: <ShieldAlert className="size-3.5 text-purple-700 shrink-0" />,
    bg: 'bg-purple-50',
    text: 'text-purple-900',
    border: 'border-purple-300',
  },
  CITY_ADMIN: {
    label: 'City Admin',
    icon: <Building2 className="size-3.5 text-blue-700 shrink-0" />,
    bg: 'bg-blue-50',
    text: 'text-blue-900',
    border: 'border-blue-300',
  },
  SUPPORT_ADMIN: {
    label: 'Support Admin',
    icon: <Headphones className="size-3.5 text-emerald-700 shrink-0" />,
    bg: 'bg-emerald-50',
    text: 'text-emerald-900',
    border: 'border-emerald-300',
  },
  FINANCE_ADMIN: {
    label: 'Finance Admin',
    icon: <Wallet className="size-3.5 text-amber-700 shrink-0" />,
    bg: 'bg-amber-50',
    text: 'text-amber-900',
    border: 'border-amber-300',
  },
};

export function AdminRoleBadge({ role, className = '' }: { role: AdminRole | string; className?: string }) {
  const style = ROLE_STYLES[role as AdminRole] ?? {
    label: role,
    icon: null,
    bg: 'bg-surface-muted',
    text: 'text-text',
    border: 'border-border-strong',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style.bg} ${style.text} ${style.border} ${className}`}
    >
      {style.icon}
      <span>{style.label}</span>
    </span>
  );
}
