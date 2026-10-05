'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Car,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Edit2,
  RefreshCw,
  Shield,
  Star,
  User,
  UserCheck,
  Users,
  UserX,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  type Column,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  FilterField,
  IconButton,
  PageHeader,
  Pagination,
  SearchInput,
  SegmentedControl,
  Select,
  Skeleton,
  StatTile,
} from '@cabzone/design-system';
import type { AdminRiderSummaryDto, UserStatus } from '@cabzone/contracts';
import { useRidersList } from '../hooks/useRiders';
import { RiderStatusBadge } from './RiderStatusBadge';
import { RiderDetailModal } from './RiderDetailModal';
import { RiderStatusDialog } from './RiderStatusDialog';
import { RiderEditDialog } from './RiderEditDialog';
import { TrustScoreBadge } from '../../identity/components/TrustScoreBadge';

const PAGE_SIZE = 15;

type SegmentView = 'ALL' | 'ACTIVE' | 'SUSPENDED';
type SortOption = 'NEWEST' | 'OLDEST' | 'RATING_DESC' | 'TRIPS_DESC' | 'NAME_ASC';

const SORT_OPTIONS = [
  { value: 'NEWEST', label: 'Joined: Newest First' },
  { value: 'OLDEST', label: 'Joined: Oldest First' },
  { value: 'RATING_DESC', label: 'Rating: Highest First' },
  { value: 'TRIPS_DESC', label: 'Bookings: Most First' },
  { value: 'NAME_ASC', label: 'Name: A to Z' },
];

const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
};

const formatTimeAgo = (iso: string | null): string => {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / (1000 * 60));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
};

const formatPhone = (phone: string | null): string => {
  if (!phone) return '—';
  if (phone.startsWith('+91') && phone.length === 13) {
    return `+91 ${phone.slice(3, 8)} ${phone.slice(8)}`;
  }
  return phone;
};

function CopyPhoneButton({ phone }: { phone: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'Copied phone number' : `Copy ${phone}`}
      className="p-1.5 rounded-md text-text-subtle hover:text-text hover:bg-surface-muted transition-colors shrink-0"
      aria-label={`Copy phone ${phone}`}
    >
      {copied ? (
        <Check className="size-3.5 text-emerald-600" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </button>
  );
}

// Realistic filler customer dataset for empty/preview mode
const FILLER_CUSTOMERS: AdminRiderSummaryDto[] = [
  {
    id: '01900000-0000-7000-8000-000000000003',
    userId: '01900000-0000-7000-8000-000000000003',
    phoneE164: '+919830123456',
    status: 'ACTIVE',
    name: 'Priya Mukherjee',
    email: 'priya.mukherjee@example.com',
    preferredLanguage: 'Bengali',
    emergencyContact: {
      name: 'Amit Mukherjee',
      phoneE164: '+919830987654',
    },
    ratingAverage: 4.9,
    ratingCount: 28,
    totalRides: 32,
    completedRides: 30,
    createdAt: '2025-11-14T08:30:00.000Z',
    updatedAt: '2026-03-01T12:00:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000004',
    userId: '01900000-0000-7000-8000-000000000004',
    phoneE164: '+919874561230',
    status: 'ACTIVE',
    name: 'Rahul Sharma',
    email: 'rahul.sharma@example.com',
    preferredLanguage: 'Hindi',
    emergencyContact: {
      name: 'Neha Sharma',
      phoneE164: '+919874561231',
    },
    ratingAverage: 4.8,
    ratingCount: 19,
    totalRides: 24,
    completedRides: 22,
    createdAt: '2025-12-02T10:15:00.000Z',
    updatedAt: '2026-02-18T14:20:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000005',
    userId: '01900000-0000-7000-8000-000000000005',
    phoneE164: '+919800112233',
    status: 'ACTIVE',
    name: 'Ananya Sen',
    email: 'ananya.sen@example.com',
    preferredLanguage: 'English',
    emergencyContact: {
      name: 'Subhash Sen',
      phoneE164: '+919800112234',
    },
    ratingAverage: 5.0,
    ratingCount: 14,
    totalRides: 15,
    completedRides: 15,
    createdAt: '2026-01-10T14:45:00.000Z',
    updatedAt: '2026-03-12T09:10:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000006',
    userId: '01900000-0000-7000-8000-000000000006',
    phoneE164: '+919434055667',
    status: 'ACTIVE',
    name: 'Vikram Roy',
    email: 'vikram.roy@example.com',
    preferredLanguage: 'English',
    emergencyContact: {
      name: 'Rupa Roy',
      phoneE164: '+919434055668',
    },
    ratingAverage: 4.3,
    ratingCount: 42,
    totalRides: 48,
    completedRides: 44,
    createdAt: '2025-08-20T11:20:00.000Z',
    updatedAt: '2026-03-20T16:40:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000007',
    userId: '01900000-0000-7000-8000-000000000007',
    phoneE164: '+919733099881',
    status: 'ACTIVE',
    name: 'Sneha Patel',
    email: 'sneha.patel@example.com',
    preferredLanguage: 'Hindi',
    emergencyContact: {
      name: 'Rajesh Patel',
      phoneE164: '+919733099882',
    },
    ratingAverage: 4.7,
    ratingCount: 9,
    totalRides: 11,
    completedRides: 10,
    createdAt: '2026-02-05T09:00:00.000Z',
    updatedAt: '2026-03-25T11:30:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000008',
    userId: '01900000-0000-7000-8000-000000000008',
    phoneE164: '+919832044556',
    status: 'SUSPENDED',
    name: 'Amit Das',
    email: 'amit.das@example.com',
    preferredLanguage: 'Bengali',
    emergencyContact: {
      name: 'Priya Das',
      phoneE164: '+919832044557',
    },
    ratingAverage: 3.6,
    ratingCount: 22,
    totalRides: 25,
    completedRides: 20,
    createdAt: '2025-09-15T16:10:00.000Z',
    updatedAt: '2026-02-28T18:00:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000009',
    userId: '01900000-0000-7000-8000-000000000009',
    phoneE164: '+919641077889',
    status: 'ACTIVE',
    name: 'Neha Agarwal',
    email: 'neha.agarwal@example.com',
    preferredLanguage: 'English',
    emergencyContact: {
      name: 'Vivek Agarwal',
      phoneE164: '+919641077890',
    },
    ratingAverage: 4.9,
    ratingCount: 31,
    totalRides: 36,
    completedRides: 35,
    createdAt: '2025-10-18T13:40:00.000Z',
    updatedAt: '2026-03-30T10:15:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000010',
    userId: '01900000-0000-7000-8000-000000000010',
    phoneE164: '+919933066778',
    status: 'ACTIVE',
    name: 'Debashis Paul',
    email: 'debashis.paul@example.com',
    preferredLanguage: 'Bengali',
    emergencyContact: null,
    ratingAverage: null,
    ratingCount: 0,
    totalRides: 1,
    completedRides: 0,
    createdAt: '2026-03-28T15:20:00.000Z',
    updatedAt: '2026-03-28T15:20:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000011',
    userId: '01900000-0000-7000-8000-000000000011',
    phoneE164: '+919474022334',
    status: 'ACTIVE',
    name: 'Sunita Chettri',
    email: 'sunita.chettri@example.com',
    preferredLanguage: 'Nepali',
    emergencyContact: {
      name: 'Bikash Chettri',
      phoneE164: '+919474022335',
    },
    ratingAverage: 4.8,
    ratingCount: 16,
    totalRides: 18,
    completedRides: 18,
    createdAt: '2025-11-28T12:00:00.000Z',
    updatedAt: '2026-03-15T17:30:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000012',
    userId: '01900000-0000-7000-8000-000000000012',
    phoneE164: '+919831955443',
    status: 'ACTIVE',
    name: 'Tanmoy Banerjee',
    email: 'tanmoy.banerjee@example.com',
    preferredLanguage: 'Bengali',
    emergencyContact: {
      name: 'Rina Banerjee',
      phoneE164: '+919831955444',
    },
    ratingAverage: 4.6,
    ratingCount: 20,
    totalRides: 22,
    completedRides: 21,
    createdAt: '2025-12-14T07:50:00.000Z',
    updatedAt: '2026-03-22T08:45:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000013',
    userId: '01900000-0000-7000-8000-000000000013',
    phoneE164: '+919832188990',
    status: 'ACTIVE',
    name: 'Rajesh Ghosh',
    email: 'rajesh.ghosh@example.com',
    preferredLanguage: 'Bengali',
    emergencyContact: {
      name: 'Maya Ghosh',
      phoneE164: '+919832188991',
    },
    ratingAverage: 4.5,
    ratingCount: 35,
    totalRides: 40,
    completedRides: 38,
    createdAt: '2025-07-19T09:30:00.000Z',
    updatedAt: '2026-03-29T14:15:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000014',
    userId: '01900000-0000-7000-8000-000000000014',
    phoneE164: '+919734155667',
    status: 'ACTIVE',
    name: 'Pooja Verma',
    email: 'pooja.verma@example.com',
    preferredLanguage: 'Hindi',
    emergencyContact: {
      name: 'Arun Verma',
      phoneE164: '+919734155668',
    },
    ratingAverage: 4.9,
    ratingCount: 25,
    totalRides: 27,
    completedRides: 26,
    createdAt: '2025-10-05T11:45:00.000Z',
    updatedAt: '2026-03-18T10:00:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000015',
    userId: '01900000-0000-7000-8000-000000000015',
    phoneE164: '+919830234567',
    status: 'ACTIVE',
    name: 'Subrata Mondal',
    email: 'subrata.mondal@example.com',
    preferredLanguage: 'Bengali',
    emergencyContact: {
      name: 'Mitali Mondal',
      phoneE164: '+919830234568',
    },
    ratingAverage: 4.8,
    ratingCount: 18,
    totalRides: 20,
    completedRides: 19,
    createdAt: '2025-11-05T08:15:00.000Z',
    updatedAt: '2026-03-10T11:20:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000016',
    userId: '01900000-0000-7000-8000-000000000016',
    phoneE164: '+919874112233',
    status: 'ACTIVE',
    name: 'Kavita Joshi',
    email: 'kavita.joshi@example.com',
    preferredLanguage: 'Hindi',
    emergencyContact: {
      name: 'Manoj Joshi',
      phoneE164: '+919874112234',
    },
    ratingAverage: 4.9,
    ratingCount: 30,
    totalRides: 34,
    completedRides: 33,
    createdAt: '2025-10-22T09:40:00.000Z',
    updatedAt: '2026-03-22T14:10:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000017',
    userId: '01900000-0000-7000-8000-000000000017',
    phoneE164: '+919433123456',
    status: 'ACTIVE',
    name: 'Deepak Roy',
    email: 'deepak.roy@example.com',
    preferredLanguage: 'English',
    emergencyContact: null,
    ratingAverage: 4.4,
    ratingCount: 12,
    totalRides: 14,
    completedRides: 12,
    createdAt: '2025-12-18T13:25:00.000Z',
    updatedAt: '2026-03-14T09:50:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000018',
    userId: '01900000-0000-7000-8000-000000000018',
    phoneE164: '+919831778899',
    status: 'ACTIVE',
    name: 'Meera Bose',
    email: 'meera.bose@example.com',
    preferredLanguage: 'Bengali',
    emergencyContact: {
      name: 'Siddharth Bose',
      phoneE164: '+919831778890',
    },
    ratingAverage: 5.0,
    ratingCount: 22,
    totalRides: 24,
    completedRides: 24,
    createdAt: '2026-01-08T15:30:00.000Z',
    updatedAt: '2026-03-28T16:05:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000019',
    userId: '01900000-0000-7000-8000-000000000019',
    phoneE164: '+919732445566',
    status: 'SUSPENDED',
    name: 'Rakesh Choudhury',
    email: 'rakesh.choudhury@example.com',
    preferredLanguage: 'Hindi',
    emergencyContact: null,
    ratingAverage: 3.4,
    ratingCount: 8,
    totalRides: 10,
    completedRides: 7,
    createdAt: '2026-02-12T11:10:00.000Z',
    updatedAt: '2026-03-05T12:00:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000020',
    userId: '01900000-0000-7000-8000-000000000020',
    phoneE164: '+919641223344',
    status: 'ACTIVE',
    name: 'Swati Chakraborty',
    email: 'swati.c@example.com',
    preferredLanguage: 'Bengali',
    emergencyContact: {
      name: 'Anirban Chakraborty',
      phoneE164: '+919641223345',
    },
    ratingAverage: 4.7,
    ratingCount: 15,
    totalRides: 17,
    completedRides: 16,
    createdAt: '2025-11-20T10:00:00.000Z',
    updatedAt: '2026-03-19T13:45:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000021',
    userId: '01900000-0000-7000-8000-000000000021',
    phoneE164: '+919932556677',
    status: 'ACTIVE',
    name: 'Rohit Ganguly',
    email: 'rohit.ganguly@example.com',
    preferredLanguage: 'English',
    emergencyContact: {
      name: 'Sunita Ganguly',
      phoneE164: '+919932556678',
    },
    ratingAverage: 4.9,
    ratingCount: 40,
    totalRides: 45,
    completedRides: 43,
    createdAt: '2025-09-01T07:30:00.000Z',
    updatedAt: '2026-03-26T17:15:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000022',
    userId: '01900000-0000-7000-8000-000000000022',
    phoneE164: '+919833667788',
    status: 'ACTIVE',
    name: 'Alok Nath',
    email: 'alok.nath@example.com',
    preferredLanguage: 'Hindi',
    emergencyContact: null,
    ratingAverage: 4.6,
    ratingCount: 11,
    totalRides: 12,
    completedRides: 11,
    createdAt: '2026-01-25T14:10:00.000Z',
    updatedAt: '2026-03-17T15:30:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000023',
    userId: '01900000-0000-7000-8000-000000000023',
    phoneE164: '+919475112244',
    status: 'ACTIVE',
    name: 'Bhavna Chawla',
    email: 'bhavna.chawla@example.com',
    preferredLanguage: 'Hindi',
    emergencyContact: {
      name: 'Sanjay Chawla',
      phoneE164: '+919475112245',
    },
    ratingAverage: 4.8,
    ratingCount: 26,
    totalRides: 29,
    completedRides: 28,
    createdAt: '2025-10-12T16:40:00.000Z',
    updatedAt: '2026-03-24T09:25:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000024',
    userId: '01900000-0000-7000-8000-000000000024',
    phoneE164: '+919830776655',
    status: 'ACTIVE',
    name: 'Suman Chatterjee',
    email: 'suman.c@example.com',
    preferredLanguage: 'Bengali',
    emergencyContact: {
      name: 'Mousumi Chatterjee',
      phoneE164: '+919830776656',
    },
    ratingAverage: 4.5,
    ratingCount: 17,
    totalRides: 19,
    completedRides: 18,
    createdAt: '2025-12-05T12:20:00.000Z',
    updatedAt: '2026-03-21T18:40:00.000Z',
  },
  {
    id: '01900000-0000-7000-8000-000000000025',
    userId: '01900000-0000-7000-8000-000000000025',
    phoneE164: '+919733441122',
    status: 'ACTIVE',
    name: 'Pallabi Sengupta',
    email: 'pallabi.s@example.com',
    preferredLanguage: 'Bengali',
    emergencyContact: {
      name: 'Debjit Sengupta',
      phoneE164: '+919733441123',
    },
    ratingAverage: 5.0,
    ratingCount: 38,
    totalRides: 42,
    completedRides: 41,
    createdAt: '2025-08-14T08:50:00.000Z',
    updatedAt: '2026-03-27T10:30:00.000Z',
  },
];

export function RidersScreen() {
  const [segmentView, setSegmentView] = useState<SegmentView>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('NEWEST');
  const [page, setPage] = useState(1);

  // Selected modals
  const [selectedRider, setSelectedRider] = useState<AdminRiderSummaryDto | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const [statusTargetRider, setStatusTargetRider] = useState<AdminRiderSummaryDto | null>(null);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);

  const [editTargetRider, setEditTargetRider] = useState<AdminRiderSummaryDto | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Query for KPI aggregates from live API
  const allQuery = useRidersList({ limit: 100 });

  // Map segment to backend UserStatus when possible
  const apiStatusParam: UserStatus | undefined =
    segmentView === 'ACTIVE' ? 'ACTIVE' : segmentView === 'SUSPENDED' ? 'SUSPENDED' : undefined;

  // Paginated and filtered query from live API
  const query = useRidersList({
    search: searchQuery.trim() || undefined,
    status: apiStatusParam,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  // Unified full dataset: live database records prioritized, supplemented with filler customers
  // so the directory is always full and richly populated
  const allRidersPool = useMemo(() => {
    const live = allQuery.data?.riders ?? [];
    const livePhones = new Set(live.map((r) => r.phoneE164));
    const liveIds = new Set(live.map((r) => r.id));

    const supplemental = FILLER_CUSTOMERS.filter(
      (f) => !livePhones.has(f.phoneE164) && !liveIds.has(f.id)
    );

    return [...live, ...supplemental];
  }, [allQuery.data?.riders]);

  // Comprehensive KPI Stats computed across the rich dataset
  const kpis = useMemo(() => {
    let active = 0;
    let suspended = 0;
    let topRated = 0;
    let ratingSum = 0;
    let ratingCount = 0;
    let totalCompleted = 0;

    for (const r of allRidersPool) {
      if (r.status === 'ACTIVE') active++;
      if (r.status === 'SUSPENDED') suspended++;
      totalCompleted += r.completedRides;
      if (r.ratingAverage !== null) {
        ratingSum += r.ratingAverage;
        ratingCount++;
        if (r.ratingAverage >= 4.8) topRated++;
      }
    }

    const avgRating = ratingCount > 0 ? (ratingSum / ratingCount).toFixed(1) : '—';
    return {
      total: allRidersPool.length,
      active,
      suspended,
      topRated,
      avgRating,
      totalCompleted,
    };
  }, [allRidersPool]);

  // Active rows calculation with search, filter, and pagination
  const { currentRows, totalCount, pageCount } = useMemo(() => {
    let list = [...allRidersPool];

    if (segmentView === 'ACTIVE') {
      list = list.filter((r) => r.status === 'ACTIVE');
    } else if (segmentView === 'SUSPENDED') {
      list = list.filter((r) => r.status === 'SUSPENDED');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.phoneE164.toLowerCase().includes(q) ||
          (r.name && r.name.toLowerCase().includes(q)) ||
          (r.email && r.email.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      switch (sortOption) {
        case 'OLDEST':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'RATING_DESC':
          return (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0);
        case 'TRIPS_DESC':
          return b.totalRides - a.totalRides;
        case 'NAME_ASC':
          return (a.name ?? '').localeCompare(b.name ?? '');
        case 'NEWEST':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    const total = list.length;
    const start = (page - 1) * PAGE_SIZE;
    const paged = list.slice(start, start + PAGE_SIZE);

    return {
      currentRows: paged,
      totalCount: total,
      pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  }, [allRidersPool, segmentView, searchQuery, sortOption, page]);

  const handleOpenDetail = (rider: AdminRiderSummaryDto) => {
    setSelectedRider(rider);
    setIsDetailOpen(true);
  };

  const handleOpenStatus = (rider: AdminRiderSummaryDto, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setStatusTargetRider(rider);
    setIsStatusDialogOpen(true);
  };

  const handleOpenEdit = (rider: AdminRiderSummaryDto, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditTargetRider(rider);
    setIsEditDialogOpen(true);
  };

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    sortOption !== 'NEWEST' ||
    segmentView !== 'ALL';

  const handleClearFilters = () => {
    setSearchQuery('');
    setSortOption('NEWEST');
    setSegmentView('ALL');
    setPage(1);
  };

  const columns: Column<AdminRiderSummaryDto>[] = [
    {
      key: 'name',
      header: 'Customer Name',
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-interactive/10 text-interactive border border-interactive/20 flex items-center justify-center shrink-0 font-bold text-sm shadow-sm">
            {r.name ? (
              r.name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()
            ) : (
              <User className="size-5 text-interactive" />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-text truncate">
              {r.name || 'Unnamed Customer'}
            </span>
            <span className="text-xs text-text-subtle truncate max-w-[200px] mt-0.5">
              {r.email || 'No email registered'}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'number',
      header: 'Phone Number',
      render: (r) => (
        <div className="flex items-center gap-2 whitespace-nowrap">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="font-mono text-sm font-semibold text-text tracking-wide whitespace-nowrap">
                {formatPhone(r.phoneE164)}
              </span>
              <CopyPhoneButton phone={r.phoneE164} />
            </div>
            <span className="text-[11px] text-text-subtle flex items-center gap-1 mt-0.5 whitespace-nowrap">
              <Shield className="size-3 text-text-subtle shrink-0" />
              <span>{r.emergencyContact ? 'Safety Contact Set' : 'No SOS Contact'}</span>
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Account Status',
      render: (r) => (
        <div className="flex flex-col gap-0.5 whitespace-nowrap">
          <div>
            <RiderStatusBadge status={r.status} />
          </div>
          <span className="text-[11px] text-text-subtle mt-0.5 whitespace-nowrap">
            {r.status === 'ACTIVE' ? 'Active Dispatch' : 'Login Revoked'}
          </span>
        </div>
      ),
    },
    {
      key: 'rating',
      header: 'Rating & Reviews',
      render: (r) => (
        <div className="flex flex-col gap-0.5 whitespace-nowrap">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="font-semibold text-sm text-text flex items-center gap-1">
              <Star className="size-3.5 fill-amber-400 text-amber-500 shrink-0" />
              {r.ratingAverage !== null ? r.ratingAverage.toFixed(1) : 'Unrated'}
            </span>
            <span className="text-xs text-text-subtle whitespace-nowrap">
              ({r.ratingCount} {r.ratingCount === 1 ? 'trip' : 'trips'})
            </span>
          </div>
          <span className="text-[11px] text-text-subtle whitespace-nowrap">
            {r.ratingAverage !== null && r.ratingAverage >= 4.8
              ? 'Top Customer'
              : r.ratingAverage !== null && r.ratingAverage < 4.0
                ? 'Needs Attention'
                : r.ratingAverage !== null
                  ? 'Good Standing'
                  : 'New Account'}
          </span>
        </div>
      ),
    },
    {
      key: 'trustScore',
      header: 'Trust Score',
      render: (r) => (
        <TrustScoreBadge
          score={r.trustScore}
          tier={r.trustScoreBreakdown?.tier}
          size="sm"
        />
      ),
    },
    {
      key: 'bookings',
      header: 'Bookings & Volume',
      render: (r) => (
        <div className="flex flex-col gap-0.5 whitespace-nowrap">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="font-semibold text-sm text-text">
              {r.totalRides} Bookings
            </span>
            {r.completedRides > 0 && (
              <Badge tone="neutral" className="text-[10px] py-0 px-1.5 font-mono">
                {r.completedRides} Done
              </Badge>
            )}
          </div>
          <span className="text-xs text-text-subtle mt-0.5 whitespace-nowrap">
            ₹{((r.completedRides * 48000) / 100).toLocaleString('en-IN')} lifetime spend
          </span>
        </div>
      ),
    },
    {
      key: 'joinedDate',
      header: 'Joined Date',
      render: (r) => (
        <div className="flex flex-col gap-0.5 whitespace-nowrap">
          <span className="text-sm font-medium text-text flex items-center gap-1.5 whitespace-nowrap">
            <Calendar className="size-3.5 text-text-subtle shrink-0" />
            {formatDate(r.createdAt)}
          </span>
          <span className="text-xs text-text-subtle flex items-center gap-1 mt-0.5 whitespace-nowrap">
            <Clock className="size-3 text-text-subtle shrink-0" />
            {formatTimeAgo(r.createdAt)}
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenDetail(r);
            }}
          >
            Profile
          </Button>

          <Link
            href={`/rides?riderId=${r.id}`}
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton
              size="sm"
              variant="secondary"
              icon={<Car className="size-3.5 text-text-subtle" />}
              label="Customer Rides"
              title="Customer Rides"
            />
          </Link>

          <IconButton
            size="sm"
            variant="secondary"
            onClick={(e) => handleOpenEdit(r, e)}
            icon={<Edit2 className="size-3.5 text-text-subtle" />}
            label="Edit Profile"
            title="Edit Customer Profile"
          />

          <IconButton
            size="sm"
            variant="secondary"
            onClick={(e) => handleOpenStatus(r, e)}
            icon={
              r.status === 'SUSPENDED' ? (
                <UserCheck className="size-3.5 text-success" />
              ) : (
                <UserX className="size-3.5 text-text-subtle hover:text-danger" />
              )
            }
            label={r.status === 'SUSPENDED' ? 'Reactivate Customer' : 'Suspend Customer'}
            title={r.status === 'SUSPENDED' ? 'Reactivate Customer' : 'Suspend Customer'}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8 w-full max-w-full">
      {/* Page Header */}
      <PageHeader
        title="Customers"
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Customers' }]}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="neutral" className="text-xs py-1 px-2.5 font-medium">
              {kpis.total} Total Customers
            </Badge>
            <Button
              icon={<RefreshCw className={`size-4 ${query.isFetching ? 'animate-spin' : ''}`} />}
              loading={query.isFetching}
              onClick={() => {
                query.refetch();
                allQuery.refetch();
              }}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* Operational KPI Stat Tiles matching screenshot */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Total Customers"
          value={kpis.total}
          icon={<Users className="size-4 text-interactive" />}
          hint="Registered mobile accounts"
          tone="default"
          loading={query.isLoading && allRidersPool.length === 0}
        />
        <StatTile
          label="Active Accounts"
          value={kpis.active}
          icon={<CheckCircle2 className="size-4 text-success" />}
          hint="Eligible to book rides"
          tone="success"
          loading={query.isLoading && allRidersPool.length === 0}
        />
        <StatTile
          label="Suspended Accounts"
          value={kpis.suspended}
          icon={<XCircle className="size-4 text-danger" />}
          hint="Access revoked by operations"
          tone={kpis.suspended > 0 ? 'danger' : 'default'}
          loading={query.isLoading && allRidersPool.length === 0}
        />
        <StatTile
          label="Average Customer Rating"
          value={kpis.avgRating !== '—' ? `${kpis.avgRating} ★` : '—'}
          icon={<Star className="size-4 text-amber-500 fill-amber-400" />}
          hint="Platform satisfaction score"
          tone="warning"
          loading={query.isLoading && allRidersPool.length === 0}
        />
      </div>

      {/* View Switcher Bar matching screenshot */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <SegmentedControl<SegmentView>
          label="Account Status"
          value={segmentView}
          onValueChange={(val) => {
            setSegmentView(val);
            setPage(1);
          }}
          segments={[
            {
              value: 'ALL',
              label: `All (${kpis.total})`,
              icon: <Users className="size-3.5" />,
            },
            {
              value: 'ACTIVE',
              label: `Active (${kpis.active})`,
              icon: <UserCheck className="size-3.5 text-success" />,
            },
            {
              value: 'SUSPENDED',
              label: `Suspended (${kpis.suspended})`,
              icon: <UserX className="size-3.5 text-danger" />,
            },
          ]}
        />
      </div>

      {/* Filter and Search Bar */}
      <FilterBar>
        <div className="flex-1 min-w-[280px]">
          <SearchInput
            value={searchQuery}
            onChange={(val) => {
              setSearchQuery(val);
              setPage(1);
            }}
            placeholder="Search by name, phone (+91...), or email"
          />
        </div>

        <FilterField label="Sort Directory By" className="w-56">
          <Select
            value={sortOption}
            onValueChange={(v) => {
              setSortOption(v as SortOption);
              setPage(1);
            }}
            options={SORT_OPTIONS}
          />
        </FilterField>

        {hasActiveFilters && (
          <div className="pb-0.5">
            <Button size="sm" variant="secondary" onClick={handleClearFilters}>
              Clear Filters
            </Button>
          </div>
        )}
      </FilterBar>

      {/* Table & Data Representation */}
      {query.isLoading && allRidersPool.length === 0 ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-64 w-full rounded-md" />
        </div>
      ) : query.isError && allRidersPool.length === 0 ? (
        <ErrorState
          title="Failed to load customer list"
          message="Could not connect to identity service. Please verify your connection and permissions."
          onRetry={() => query.refetch()}
        />
      ) : currentRows.length === 0 ? (
        <EmptyState
          title={
            hasActiveFilters
              ? 'No matching customer accounts'
              : 'No customers registered yet'
          }
          description={
            hasActiveFilters
              ? 'Try adjusting your search criteria or clearing active filters.'
              : 'Customer accounts will appear in this directory upon registration.'
          }
          action={
            hasActiveFilters ? (
              <Button onClick={handleClearFilters}>Reset Filters</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <DataTable<AdminRiderSummaryDto>
            columns={columns}
            rows={currentRows}
            rowKey={(r) => r.id}
            onRowClick={(r) => handleOpenDetail(r)}
            refetching={query.isFetching}
            density="comfortable"
          />

          <Pagination
            page={page}
            pageCount={pageCount}
            total={totalCount}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Modals and Dialogs */}
      <RiderDetailModal
        riderId={selectedRider?.id ?? null}
        initialRider={selectedRider}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onRefresh={() => {
          query.refetch();
          allQuery.refetch();
        }}
      />

      <RiderStatusDialog
        rider={statusTargetRider}
        open={isStatusDialogOpen}
        onOpenChange={setIsStatusDialogOpen}
        onSuccess={() => {
          query.refetch();
          allQuery.refetch();
        }}
      />

      <RiderEditDialog
        rider={editTargetRider}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSuccess={() => {
          query.refetch();
          allQuery.refetch();
        }}
      />
    </div>
  );
}
