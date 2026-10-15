import type { RideEventDto } from '@/lib/api/endpoints/rides';

export function getPendingCounters(events: RideEventDto[]): { driverId: string; farePaise: number }[] {
  const pending = new Map<string, number>();
  for (const event of [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!['FARE_COUNTER_PROPOSED', 'FARE_COUNTER_ACCEPTED', 'FARE_COUNTER_REJECTED'].includes(event.eventType)) continue;
    const driverId = event.metadata?.driverId;
    if (typeof driverId !== 'string' || !driverId) continue;
    if (event.eventType === 'FARE_COUNTER_PROPOSED') {
      const farePaise = Number(event.metadata?.proposedFarePaise);
      if (Number.isFinite(farePaise) && farePaise > 0) pending.set(driverId, farePaise);
    } else {
      pending.delete(driverId);
    }
  }
  return [...pending].map(([driverId, farePaise]) => ({ driverId, farePaise }));
}
