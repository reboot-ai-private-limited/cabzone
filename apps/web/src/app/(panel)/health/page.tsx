import { Suspense } from 'react';
import { Skeleton } from '@cabzone/design-system';
import { HealthScreen } from '@/features/health/components/HealthScreen';

export default function HealthPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-md" />}>
      <HealthScreen />
    </Suspense>
  );
}
