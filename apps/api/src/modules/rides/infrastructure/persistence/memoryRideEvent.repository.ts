import type { RideEventEntity, RideEventRepositoryPort } from '../../domain/index.js';

export class MemoryRideEventRepository implements RideEventRepositoryPort {
  private readonly events: RideEventEntity[] = [];

  async save(event: RideEventEntity): Promise<RideEventEntity> {
    const copy = { ...event };
    this.events.push(copy);
    return { ...copy };
  }

  async findByRideId(rideId: string): Promise<RideEventEntity[]> {
    return this.events
      .filter((e) => e.rideId === rideId)
      .map((e) => ({ ...e }));
  }

  async findByRideIds(
    rideIds: readonly string[],
    eventTypes?: readonly string[],
  ): Promise<RideEventEntity[]> {
    if (rideIds.length === 0) return [];
    const idSet = new Set(rideIds);
    const typeSet = eventTypes && eventTypes.length > 0 ? new Set(eventTypes) : null;
    return this.events
      .filter((e) => idSet.has(e.rideId) && (!typeSet || typeSet.has(e.eventType)))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((e) => ({ ...e }));
  }
}
