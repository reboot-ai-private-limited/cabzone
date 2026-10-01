import type { RiderEntity, RiderRepositoryPort } from '../../domain/index.js';
import { RiderModel, type RiderDocument } from './rider.model.js';

export class MongoRiderRepository implements RiderRepositoryPort {
  async findById(riderId: string): Promise<RiderEntity | null> {
    const doc = await RiderModel.findById(riderId).lean<RiderDocument | null>().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByUserId(userId: string): Promise<RiderEntity | null> {
    const doc = await RiderModel.findOne({ user_id: userId }).lean<RiderDocument | null>().exec();
    if (!doc) return null;
    return this.toEntity(doc);
  }

  async create(rider: RiderEntity): Promise<RiderEntity> {
    const created = await RiderModel.create({
      _id: rider.id,
      user_id: rider.userId,
      name: rider.name,
      email: rider.email,
      emergency_contact: rider.emergencyContact
        ? {
            name: rider.emergencyContact.name,
            phone_e164: rider.emergencyContact.phoneE164,
          }
        : null,
      preferred_language: rider.preferredLanguage,
      rating_average: rider.ratingAverage,
      rating_count: rider.ratingCount,
      version: rider.version,
    });
    return this.toEntity(created.toObject() as RiderDocument);
  }

  private toEntity(doc: RiderDocument): RiderEntity {
    return {
      id: doc._id,
      userId: doc.user_id,
      name: doc.name,
      email: doc.email,
      emergencyContact: doc.emergency_contact
        ? {
            name: doc.emergency_contact.name,
            phoneE164: doc.emergency_contact.phone_e164,
          }
        : null,
      preferredLanguage: doc.preferred_language,
      ratingAverage: doc.rating_average,
      ratingCount: doc.rating_count,
      version: doc.version,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }
}
