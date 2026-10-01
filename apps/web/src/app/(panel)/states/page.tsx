import { Skeleton } from '@cabzone/design-system';
import { Suspense } from 'react';
import { StatesScreen } from '@/features/states/components/StatesScreen';

export default function StatesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-md" />}>
      <StatesScreen />
    </Suspense>
  );
}
