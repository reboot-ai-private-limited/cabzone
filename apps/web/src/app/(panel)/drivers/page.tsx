import { Suspense } from 'react';
import { Skeleton } from '@cabzone/design-system';
import { DriversScreen } from '@/features/drivers/components/DriversScreen';

export default function DriversPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-md" />}>
      <DriversScreen />
    </Suspense>
  );
}
