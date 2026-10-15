import { describe, expect, it } from 'vitest';
import type { RideEventDto } from '@/lib/api/endpoints/rides';
import { getPendingCounters } from './pendingCounters';

const event = (eventType: string, createdAt: string, metadata?: RideEventDto['metadata']): RideEventDto => ({
  id: `${eventType}-${createdAt}`,
  eventType,
  actorType: 'DRIVER',
  actorId: null,
  previousStatus: 'OFFERING',
  newStatus: 'OFFERING',
  createdAt,
  ...(metadata === undefined ? {} : { metadata }),
});

describe('customer simulator pending counters', () => {
  it('ignores ride events and incomplete counter events without metadata', () => {
    expect(getPendingCounters([
      event('RIDE_CREATED', '2026-01-01T00:00:00Z'),
      event('FARE_COUNTER_PROPOSED', '2026-01-01T00:00:01Z', null),
      event('FARE_COUNTER_PROPOSED', '2026-01-01T00:00:02Z', { driverId: 'driver-a' }),
    ])).toEqual([]);
  });

  it('keeps the latest valid proposal until that driver answers', () => {
    expect(getPendingCounters([
      event('FARE_COUNTER_REJECTED', '2026-01-01T00:00:04Z', { driverId: 'driver-a' }),
      event('FARE_COUNTER_PROPOSED', '2026-01-01T00:00:01Z', { driverId: 'driver-a', proposedFarePaise: 10000 }),
      event('FARE_COUNTER_PROPOSED', '2026-01-01T00:00:02Z', { driverId: 'driver-b', proposedFarePaise: 12000 }),
      event('FARE_COUNTER_PROPOSED', '2026-01-01T00:00:03Z', { driverId: 'driver-a', proposedFarePaise: 11000 }),
    ])).toEqual([{ driverId: 'driver-b', farePaise: 12000 }]);
  });
});
