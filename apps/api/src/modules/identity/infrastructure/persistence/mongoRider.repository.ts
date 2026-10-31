import type { PipelineStage } from 'mongoose';
import type { UserStatus } from '@cabzone/contracts';
import type {
  RiderEntity,
  RiderListFilter,
  RiderRepositoryPort,
  RiderWithUser,
} from '../../domain/index.js';
import { RiderModel, type RiderDocument } from './rider.model.js';
import { AppError } from '../../../../shared/errors/AppError.js';

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
    const ratingCount = rider.ratingCount > 0 ? rider.ratingCount : 0;
    const ratingAverage = ratingCount > 0 ? rider.ratingAverage : null;
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
      rating_average: ratingAverage,
      rating_count: ratingCount,
      trust_score: rider.trustScore ?? null,
      version: rider.version,
    });
    return this.toEntity(created.toObject() as RiderDocument);
  }

  async update(rider: RiderEntity): Promise<RiderEntity> {
    const ratingCount = rider.ratingCount > 0 ? rider.ratingCount : 0;
    const ratingAverage = ratingCount > 0 ? rider.ratingAverage : null;
    const updated = await RiderModel.findByIdAndUpdate(
      rider.id,
      {
        $set: {
          name: rider.name,
          email: rider.email,
          emergency_contact: rider.emergencyContact
            ? {
                name: rider.emergencyContact.name,
                phone_e164: rider.emergencyContact.phoneE164,
              }
            : null,
          preferred_language: rider.preferredLanguage,
          rating_average: ratingAverage,
          rating_count: ratingCount,
          trust_score: rider.trustScore ?? null,
          version: rider.version + 1,
        },
      },
      { new: true },
    )
      .lean<RiderDocument | null>()
      .exec();

    if (!updated) {
      throw AppError.notFound('RIDER_NOT_FOUND: Rider profile not found.');
    }
    return this.toEntity(updated);
  }

  async applyRevealedRating(
    riderId: string,
    stars: number,
  ): Promise<{ ratingAverage: number; ratingCount: number }> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const doc = await RiderModel.findById(riderId).lean<RiderDocument | null>().exec();
      if (!doc) {
        throw AppError.notFound('RIDER_NOT_FOUND: Rider profile not found.');
      }
      const prevCount = doc.rating_count > 0 ? doc.rating_count : 0;
      const prevAvg = prevCount > 0 && doc.rating_average !== null ? doc.rating_average : 0;
      const nextCount = prevCount + 1;
      const nextAvg = Number(((prevAvg * prevCount + stars) / nextCount).toFixed(2));
      const updated = await RiderModel.findOneAndUpdate(
        { _id: riderId, version: doc.version },
        {
          $set: {
            rating_count: nextCount,
            rating_average: nextAvg,
            version: doc.version + 1,
          },
        },
        { new: true },
      )
        .lean<RiderDocument | null>()
        .exec();
      if (updated) {
        return {
          ratingAverage: updated.rating_average ?? nextAvg,
          ratingCount: updated.rating_count,
        };
      }
    }
    throw AppError.conflict('RATING_AGGREGATE_CONFLICT: Rider rating aggregate retry exhausted.');
  }

  async list(filter: RiderListFilter): Promise<{ items: RiderWithUser[]; total: number }> {
    const pipeline: PipelineStage[] = [
      {
        $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
    ];

    const matchConditions: Record<string, unknown>[] = [];

    if (filter.status) {
      matchConditions.push({ 'user.status': filter.status });
    }

    if (filter.search && filter.search.trim()) {
      const s = filter.search.trim();
      const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      matchConditions.push({
        $or: [
          { name: { $regex: regex } },
          { email: { $regex: regex } },
          { _id: { $regex: regex } },
          { user_id: { $regex: regex } },
        ],
      });
    }

    if (matchConditions.length === 1 && matchConditions[0]) {
      pipeline.push({ $match: matchConditions[0] });
    } else if (matchConditions.length > 1) {
      pipeline.push({ $match: { $and: matchConditions } });
    }

    pipeline.push({
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [
          { $sort: { created_at: -1 } },
          { $skip: filter.offset },
          { $limit: filter.limit },
        ],
      },
    });

    const [facetResult] = (await RiderModel.aggregate(pipeline).exec()) as [
      | {
          metadata: { total: number }[];
          data: (RiderDocument & { user?: { status?: string } })[];
        }
      | undefined,
    ];
    const total = facetResult?.metadata?.[0]?.total ?? 0;
    const data = facetResult?.data ?? [];

    const items: RiderWithUser[] = data.map((doc) => ({
      rider: this.toEntity(doc),
      status: (doc.user?.status as UserStatus) ?? 'ACTIVE',
      totalRides: 0,
      completedRides: 0,
    }));

    return { items, total };
  }

  private toEntity(doc: RiderDocument): RiderEntity {
    const ratingCount = doc.rating_count > 0 ? doc.rating_count : 0;
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
      ratingAverage: ratingCount > 0 ? doc.rating_average : null,
      ratingCount,
      trustScore: doc.trust_score ?? null,
      version: doc.version,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }
}
