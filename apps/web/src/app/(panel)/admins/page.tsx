import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Skeleton } from '@cabzone/design-system';
import { AdminsScreen } from '@/features/admins/components/AdminsScreen';

export const metadata: Metadata = {
  title: 'Admin Users & Roles | Cabzone Admin',
  description: 'Manage administrative staff, configure role permissions, and assign regional zone jurisdictions.',
};

export default function AdminsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-md" />}>
      <AdminsScreen />
    </Suspense>
  );
}
