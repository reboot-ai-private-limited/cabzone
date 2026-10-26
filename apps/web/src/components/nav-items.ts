import type { AdminRole } from '@cabzone/contracts';
import {
  Car,
  FileCode2,
  FileText,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  MapPin,
  Receipt,
  RotateCcw,
  Settings,
  ShieldCheck,
  Tag,
  UserCircle,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  activePattern?: RegExp;
  badge?: string;
  external?: boolean;
  /** Page not built yet: rendered greyed out, non-clickable, with a "Coming soon" hover hint. */
  comingSoon?: boolean;
  /** Admin roles permitted to access this surface. Undefined means visible to all admin roles. */
  allowedRoles?: readonly AdminRole[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, comingSoon: true },
    ],
  },
  {
    title: 'Operations',
    items: [
      {
        label: 'Live Rides',
        href: '/rides',
        icon: Car,
        activePattern: /^\/rides/,
        allowedRoles: ['SUPER_ADMIN', 'CITY_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN'],
      },
      {
        label: 'Drivers',
        href: '/drivers',
        icon: Users,
        activePattern: /^\/drivers/,
        allowedRoles: ['SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN'],
      },
      {
        label: 'Customers',
        href: '/riders',
        icon: UserCircle,
        activePattern: /^\/riders/,
        allowedRoles: ['SUPER_ADMIN', 'SUPPORT_ADMIN'],
      },
    ],
  },
  {
    title: 'Geography',
    items: [
      {
        label: 'Zones',
        href: '/zones',
        icon: MapPin,
        activePattern: /^\/zones/,
        allowedRoles: ['SUPER_ADMIN', 'CITY_ADMIN'],
      },
    ],
  },
  {
    title: 'Pricing',
    items: [
      {
        label: 'Pricing',
        href: '/pricing',
        icon: Tag,
        activePattern: /^\/pricing/,
        allowedRoles: ['SUPER_ADMIN', 'CITY_ADMIN'],
      },
    ],
  },
  {
    title: 'Finance',
    items: [
      {
        label: 'Transactions',
        href: '/finance',
        icon: Receipt,
        activePattern: /^\/finance/,
        allowedRoles: ['SUPER_ADMIN', 'FINANCE_ADMIN'],
      },
      {
        label: 'Payouts',
        href: '/payouts',
        icon: Wallet,
        comingSoon: true,
        allowedRoles: ['SUPER_ADMIN', 'FINANCE_ADMIN'],
      },
      {
        label: 'Refunds',
        href: '/refunds',
        icon: RotateCcw,
        comingSoon: true,
        allowedRoles: ['SUPER_ADMIN', 'FINANCE_ADMIN'],
      },
    ],
  },
  {
    title: 'System',
    items: [
      {
        label: 'Admin Users',
        href: '/admins',
        icon: ShieldCheck,
        activePattern: /^\/admins/,
        allowedRoles: ['SUPER_ADMIN', 'CITY_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN'],
      },
      {
        label: 'Audit Log',
        href: '/audit',
        icon: FileText,
        comingSoon: true,
        allowedRoles: ['SUPER_ADMIN'],
      },
      {
        label: 'Settings',
        href: '/settings',
        icon: Settings,
        comingSoon: true,
        allowedRoles: ['SUPER_ADMIN'],
      },
    ],
  },
  {
    title: 'Developers',
    items: [
      {
        label: 'Simulators',
        href: '/simulators',
        icon: FlaskConical,
        activePattern: /^\/(simulators|quotes)/,
        allowedRoles: ['SUPER_ADMIN', 'CITY_ADMIN'],
      },
      {
        label: 'Swagger API Docs',
        href: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/docs`,
        icon: FileCode2,
        external: true,
      },
      {
        label: 'System Health',
        href: '/health',
        icon: HeartPulse,
        activePattern: /^\/health/,
        allowedRoles: ['SUPER_ADMIN', 'CITY_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN'],
      },
    ],
  },
];

export function filterNavSectionsForRole(
  sections: readonly NavSection[],
  role: AdminRole | null,
): NavSection[] {
  if (role === null) return [...sections];
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => item.allowedRoles === undefined || item.allowedRoles.includes(role),
      ),
    }))
    .filter((section) => section.items.length > 0);
}
