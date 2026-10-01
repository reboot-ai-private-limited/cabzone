import { Suspense } from 'react';
import { Skeleton } from '@cabzone/design-system';
import { FinanceScreen } from '@/features/finance/components/FinanceScreen';

export default function FinancePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-md" />}>
      <FinanceScreen />
    </Suspense>
  );
}
