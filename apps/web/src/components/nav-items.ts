import {
  Car,
  CreditCard,
  FileCode2,
  MapPin,
  Tag,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  activePattern?: RegExp;
  badge?: string;
  external?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    title: 'Operations',
    items: [
      {
        label: 'Zones',
        href: '/zones',
        icon: MapPin,
        activePattern: /^\/zones/,
        badge: 'ACTIVE',
      },
      {
        label: 'Live Rides',
        href: '/rides',
        icon: Car,
        activePattern: /^\/rides/,
      },
      {
        label: 'Drivers & KYC',
        href: '/drivers',
        icon: Users,
        activePattern: /^\/drivers/,
      },
    ],
  },
  {
    title: 'Configuration',
    items: [
      {
        label: 'Pricing Matrix',
        href: '/pricing',
        icon: Tag,
        activePattern: /^\/pricing/,
      },
      {
        label: 'Wallets & Ledger',
        href: '/finance',
        icon: CreditCard,
        activePattern: /^\/finance/,
      },
    ],
  },
  {
    title: 'Developer',
    items: [
      {
        label: 'Swagger API Docs',
        href: 'http://localhost:4000/api/docs',
        icon: FileCode2,
        external: true,
      },
    ],
  },
];
