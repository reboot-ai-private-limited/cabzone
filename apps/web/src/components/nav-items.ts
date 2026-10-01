import {
  Car,
  CreditCard,
  FileCode2,
  FileText,
  HeartPulse,
  Landmark,
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
      { label: 'Live Rides', href: '/rides', icon: Car, activePattern: /^\/rides/ },
      { label: 'Drivers & KYC', href: '/drivers', icon: Users, activePattern: /^\/drivers/ },
      { label: 'Riders', href: '/riders', icon: UserCircle, comingSoon: true },
    ],
  },
  {
    title: 'Geography',
    items: [
      { label: 'Zones', href: '/zones', icon: MapPin, activePattern: /^\/zones/ },
      { label: 'States', href: '/states', icon: Landmark, activePattern: /^\/states/ },
    ],
  },
  {
    title: 'Pricing',
    items: [
      { label: 'Pricing Matrix', href: '/pricing', icon: Tag, activePattern: /^\/pricing/ },
      { label: 'Quotes & Fare Rules', href: '/quotes', icon: Receipt, comingSoon: true },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Wallets & Ledger', href: '/finance', icon: CreditCard, activePattern: /^\/finance/ },
      { label: 'Payouts', href: '/payouts', icon: Wallet, comingSoon: true },
      { label: 'Refunds', href: '/refunds', icon: RotateCcw, comingSoon: true },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Admin Users & Roles', href: '/admins', icon: ShieldCheck, comingSoon: true },
      { label: 'Audit Log', href: '/audit', icon: FileText, comingSoon: true },
      { label: 'Settings', href: '/settings', icon: Settings, comingSoon: true },
    ],
  },
  {
    title: 'Developer',
    items: [
      {
        label: 'Swagger API Docs',
        href: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/docs`,
        icon: FileCode2,
        external: true,
      },
      { label: 'System Health', href: '/health', icon: HeartPulse, comingSoon: true },
    ],
  },
];
