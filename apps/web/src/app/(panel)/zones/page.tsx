import { Suspense } from 'react';
import { Skeleton } from '@cabzone/design-system';
import { ZonesScreen } from '@/features/zones/components/ZonesScreen';

/**
 * The boundary is not optional. `ZonesScreen` reads its view and selection from the URL via
 * `useSearchParams`, and Next opts any route that does so out of static prerendering unless the
 * component sits inside a Suspense boundary — without one the build fails on this page.
 */
export default function ZonesPage() {
  return (
    <Suspense fallback={<ZonesFallback />}>
      <ZonesScreen />
    </Suspense>
  );
}

/** The screen's real geometry — rail plus map — so the layout does not jump when it mounts. */
function ZonesFallback() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-40" />

      {/* Stat Tiles Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>

      <div className="flex gap-0 border border-border-strong rounded-xl overflow-hidden min-h-[720px] bg-surface">
        <div className="w-96 shrink-0 border-r border-border p-5 flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="flex-1 min-h-[720px] rounded-none" />
      </div>
    </div>
  );
}
