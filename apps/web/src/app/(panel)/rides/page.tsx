import { Suspense } from 'react';
import { Skeleton } from '@cabzone/design-system';
import { RidesScreen } from '@/features/rides/components/RidesScreen';

export default function RidesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-md" />}>
      <RidesScreen />
    </Suspense>
  );
}
