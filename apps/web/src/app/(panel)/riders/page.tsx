import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Skeleton } from '@cabzone/design-system';
import { RidersScreen } from '@/features/riders/components/RidersScreen';

export const metadata: Metadata = {
  title: 'Customers | Cabzone Admin',
  description: 'Customer directory, activity logs, and account management.',
};

export default function RidersPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-md" />}>
      <RidersScreen />
    </Suspense>
  );
}
