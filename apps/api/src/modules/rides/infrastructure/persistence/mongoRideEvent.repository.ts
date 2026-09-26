import type { RideEventEntity, RideEventRepositoryPort } from '../../domain/index.js';
import { RideEventModel, type RideEventDocument } from './rideEvent.model.js';

export class MongoRideEventRepository implements RideEventRepositoryPort {
  async save(event: RideEventEntity): Promise<RideEventEntity> {
    await RideEventModel.create({
      _id: event.id,
      ride_id: event.rideId,
      event_type: event.eventType,
      actor_type: event.actorType,
      actor_id: event.actorId,
      previous_status: event.previousStatus,
      new_status: event.newStatus,
      metadata: event.metadata,
      created_at: event.createdAt,
    });
    return { ...event };
  }

  async findByRideId(rideId: string): Promise<RideEventEntity[]> {
    const docs = await RideEventModel.find({ ride_id: rideId })
      .sort({ created_at: -1 })
      .lean<RideEventDocument[]>()
      .exec();

    return docs.map((doc) => ({
      id: doc._id,
      rideId: doc.ride_id,
      eventType: doc.event_type,
      actorType: doc.actor_type,
      actorId: doc.actor_id,
      previousStatus: doc.previous_status,
      newStatus: doc.new_status,
      metadata: doc.metadata,
      createdAt: doc.created_at,
    }));
  }
}
