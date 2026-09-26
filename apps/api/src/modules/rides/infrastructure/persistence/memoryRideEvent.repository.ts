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
}
