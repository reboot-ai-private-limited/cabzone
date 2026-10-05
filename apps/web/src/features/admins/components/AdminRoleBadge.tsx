import type { AdminRole } from '@cabzone/contracts';
import { Badge, type BadgeTone } from '@cabzone/design-system';
import { ShieldAlert, Building2, Headphones, Wallet } from 'lucide-react';

const ROLE_CONFIG: Record<
  AdminRole,
  { label: string; tone: BadgeTone; icon: React.ReactNode; className?: string }
> = {
  SUPER_ADMIN: {
    label: 'Super Admin',
    tone: 'accent',
    icon: <ShieldAlert className="w-3 h-3 text-purple-600 dark:text-purple-400" />,
    className: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
  },
  CITY_ADMIN: {
    label: 'City Admin',
    tone: 'info',
    icon: <Building2 className="w-3 h-3 text-blue-600 dark:text-blue-400" />,
    className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  },
  SUPPORT_ADMIN: {
    label: 'Support Admin',
    tone: 'success',
    icon: <Headphones className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />,
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  },
  FINANCE_ADMIN: {
    label: 'Finance Admin',
    tone: 'warning',
    icon: <Wallet className="w-3 h-3 text-amber-600 dark:text-amber-400" />,
    className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  },
};

export function AdminRoleBadge({ role, className }: { role: AdminRole | string; className?: string }) {
  const config = ROLE_CONFIG[role as AdminRole] ?? {
    label: role,
    tone: 'neutral' as BadgeTone,
    icon: null,
    className: '',
  };

  return (
    <Badge
      tone={config.tone}
      icon={config.icon}
      className={`font-medium tracking-wide ${config.className} ${className ?? ''}`}
    >
      {config.label}
    </Badge>
  );
}
