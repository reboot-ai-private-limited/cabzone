import type { RideEventEntity } from './rideEvent.entity.js';

export interface RideEventRepositoryPort {
  save(event: RideEventEntity): Promise<RideEventEntity>;
  findByRideId(rideId: string): Promise<RideEventEntity[]>;
}
