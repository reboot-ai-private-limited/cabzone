import { Suspense } from 'react';
import { Skeleton } from '@cabzone/design-system';
import { DriverDetailsScreen } from '@/features/drivers/components/DriverDetailsScreen';

export default async function DriverIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6 p-6 max-w-[1600px] mx-auto w-full">
          <Skeleton className="h-10 w-72 rounded-lg" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {['sk-1', 'sk-2', 'sk-3', 'sk-4'].map((skKey) => (
              <Skeleton key={skKey} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-96 rounded-xl" />
        </div>
      }
    >
      <DriverDetailsScreen id={id} />
    </Suspense>
  );
}
