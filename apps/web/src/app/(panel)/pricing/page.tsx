import { Suspense } from 'react';
import { Skeleton } from '@cabzone/design-system';
import { PricingScreen } from '@/features/pricing/components/PricingScreen.js';

export default function PricingPage() {
  return (
    <Suspense fallback={<PricingFallback />}>
      <PricingScreen />
    </Suspense>
  );
}

function PricingFallback() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <Skeleton key={i} className="h-24 rounded-md" />
        ))}
      </div>
      <Skeleton className="h-10 w-80 rounded-md" />
      <Skeleton className="h-96 w-full rounded-md" />
    </div>
  );
}
