'use client';

import { Badge, DefinitionList, Dialog, FieldRow, Skeleton } from '@cabzone/design-system';
import type { AdminRideDto } from '@/lib/api/endpoints/rides';
import { formatPaise } from '@/lib/format';
import { useRideEvents } from '../hooks/useRides';
import { RideStatusBadge } from './RideStatusBadge';

const fmt = (iso: string | null): string =>
  iso === null ? '—' : new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

const place = (p: { lat: number; lng: number; address: string | null }): string =>
  p.address ?? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;

export function RideDetailDialog({
  ride,
  onOpenChange,
}: {
  ride: AdminRideDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const events = useRideEvents(ride?.id ?? null);

  return (
    <Dialog
      open={ride !== null}
      onOpenChange={onOpenChange}
      title={ride === null ? '' : `Ride ${ride.id.slice(0, 8)}`}
      description={ride === null ? undefined : `Requested ${fmt(ride.createdAt)}`}
      className="max-w-2xl"
    >
      {ride !== null && (
        <div className="flex flex-col gap-5">
          <DefinitionList>
            <FieldRow label="Status">
              <RideStatusBadge status={ride.status} />
            </FieldRow>
            <FieldRow label="Passenger">
              {ride.passenger.name} · <span className="font-mono">{ride.passenger.phoneE164}</span>
            </FieldRow>
            <FieldRow label="Driver">
              {ride.driverId === null ? (
                <span className="text-text-subtle">Not assigned</span>
              ) : (
                <span className="font-mono">{ride.driverId.slice(0, 8)}</span>
              )}
            </FieldRow>
            <FieldRow label="Vehicle">{ride.vehicleCategory}</FieldRow>
            <FieldRow label="Pickup">{place(ride.pickup)}</FieldRow>
            <FieldRow label="Drop">{place(ride.drop)}</FieldRow>
            <FieldRow label="Trip">
              {(ride.routeSnapshot.distanceM / 1000).toFixed(1)} km ·{' '}
              {Math.round(ride.routeSnapshot.durationSeconds / 60)} min ·{' '}
              {ride.zoneSnapshot.classification}
            </FieldRow>
            <FieldRow label="Suggested fare">{formatPaise(ride.suggestedFarePaise)}</FieldRow>
            <FieldRow label="Proposed fare">
              {ride.proposedFarePaise === null ? '—' : formatPaise(ride.proposedFarePaise)}
            </FieldRow>
            <FieldRow label="Agreed fare">
              {ride.agreedFarePaise === null ? '—' : formatPaise(ride.agreedFarePaise)}
            </FieldRow>
            {ride.cancellationReason !== null && (
              <FieldRow label="Reason">
                <Badge tone="danger">{ride.cancellationReason}</Badge>
              </FieldRow>
            )}
          </DefinitionList>

          <section aria-label="Timeline" className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-subtle">
              Timeline
            </h3>
            {events.isLoading ? (
              <Skeleton className="h-16 rounded-md" />
            ) : events.isError ? (
              <p className="text-sm text-danger">Could not load the timeline.</p>
            ) : (events.data ?? []).length === 0 ? (
              <p className="text-sm text-text-subtle">No recorded events yet.</p>
            ) : (
              <ol className="flex flex-col divide-y divide-border">
                {(events.data ?? []).map((e) => (
                  <li key={e.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span className="font-medium text-text">{e.eventType.replaceAll('_', ' ')}</span>
                    <span className="text-xs text-text-subtle">
                      {e.actorType} · {fmt(e.createdAt)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}
