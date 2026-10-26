import type { RideEventEntity } from './rideEvent.entity.js';

export interface RideEventRepositoryPort {
  save(event: RideEventEntity): Promise<RideEventEntity>;
  findByRideId(rideId: string): Promise<RideEventEntity[]>;
  findByRideIds(
    rideIds: readonly string[],
    eventTypes?: readonly string[],
  ): Promise<RideEventEntity[]>;
}
