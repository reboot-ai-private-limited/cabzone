import type { RideEventActor, RideStatus } from '@Cabzone/contracts';

export interface RideEventEntity {
  id: string;
  rideId: string;
  eventType: string;
  actorType: RideEventActor;
  actorId: string | null;
  previousStatus: RideStatus | null;
  newStatus: RideStatus | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}
