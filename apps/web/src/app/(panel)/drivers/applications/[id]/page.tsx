import { Suspense } from 'react';
import { Skeleton } from '@cabzone/design-system';
import { DriverApplicationScreen } from '@/features/drivers/components/DriverApplicationScreen';

export const dynamic = 'force-dynamic';

export default async function DriverApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-md" />}>
      <DriverApplicationScreen applicationId={id} />
    </Suspense>
  );
}
