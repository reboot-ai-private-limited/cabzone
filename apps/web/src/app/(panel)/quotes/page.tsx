import { Suspense } from 'react';
import { Skeleton } from '@cabzone/design-system';
import { SimulatorsScreen } from '@/features/simulators/components/SimulatorsScreen';

export default function QuotesPage() {
  return (
    <Suspense fallback={<TripSimulatorFallback />}>
      <SimulatorsScreen defaultTab="trip" />
    </Suspense>
  );
}

function TripSimulatorFallback() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <Skeleton key={i} className="h-24 rounded-md" />
        ))}
      </div>
      <div className="flex flex-col lg:flex-row gap-6">
        <Skeleton className="flex-1 h-[520px] rounded-lg" />
        <Skeleton className="w-full lg:w-[450px] h-[520px] rounded-lg" />
      </div>
    </div>
  );
}
