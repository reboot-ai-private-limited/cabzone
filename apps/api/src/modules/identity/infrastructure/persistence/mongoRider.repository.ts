import type { PipelineStage } from 'mongoose';
import type { TrustScoreBreakdownDto, TrustTier, UserStatus } from '@cabzone/contracts';
import type {
  RiderEntity,
  RiderListFilter,
  RiderRepositoryPort,
  RiderWithUser,
  TrustSnapshot,
} from '../../domain/index.js';
import { RiderModel, type RiderDocument } from './rider.model.js';
import { AppError } from '../../../../shared/errors/AppError.js';

/** Prefers sum / count so the average never drifts; falls back to the stored average for older rows. */
function deriveAverage(sum: number | undefined, count: number, stored: number | null): number | null {
  if (count <= 0) return null;
  if (typeof sum === 'number' && sum > 0) return Number((sum / count).toFixed(2));
  return stored;
}

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
    // Ratings and trust are written only by applyRevealedRating / saveTrust, so a stale profile
    // object can never overwrite them.
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
    // One atomic pipeline update: the sum and count move together and the average is derived from
    // them, so concurrent reveals cannot lose a rating or accumulate rounding error (F10).
    // Profiles that predate rating_sum fall back to average x count for their first update.
    const updated = await RiderModel.findByIdAndUpdate(
      riderId,
      [
        {
          $set: {
            rating_sum: {
              $add: [
                {
                  $ifNull: [
                    '$rating_sum',
                    {
                      $round: [
                        {
                          $multiply: [
                            { $ifNull: ['$rating_average', 0] },
                            { $ifNull: ['$rating_count', 0] },
                          ],
                        },
                        0,
                      ],
                    },
                  ],
                },
                stars,
              ],
            },
            rating_count: { $add: [{ $ifNull: ['$rating_count', 0] }, 1] },
            version: { $add: [{ $ifNull: ['$version', 1] }, 1] },
          },
        },
        { $set: { rating_average: { $round: [{ $divide: ['$rating_sum', '$rating_count'] }, 2] } } },
      ],
      { new: true },
    )
      .lean<RiderDocument | null>()
      .exec();
    if (!updated) {
      throw AppError.notFound('RIDER_NOT_FOUND: Rider profile not found.');
    }
    return { ratingAverage: updated.rating_average ?? 0, ratingCount: updated.rating_count };
  }

  async findManyByIds(ids: string[]): Promise<RiderEntity[]> {
    if (ids.length === 0) return [];
    const docs = await RiderModel.find({ _id: { $in: ids } }).lean<RiderDocument[]>().exec();
    return docs.map((d) => this.toEntity(d));
  }

  async saveTrust(id: string, trust: TrustSnapshot): Promise<void> {
    await RiderModel.updateOne(
      { _id: id },
      {
        $set: {
          trust_score: trust.score,
          trust_tier: trust.tier,
          trust_breakdown: trust.breakdown,
          trust_updated_at: trust.updatedAt,
        },
      },
    ).exec();
  }

  async listIds(afterId: string | null, limit: number): Promise<string[]> {
    const docs = await RiderModel.find(afterId ? { _id: { $gt: afterId } } : {})
      .sort({ _id: 1 })
      .limit(limit)
      .select('_id')
      .lean<{ _id: string }[]>()
      .exec();
    return docs.map((d) => d._id);
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
          { 'user.phone_e164': { $regex: regex } },
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
          data: (RiderDocument & { user?: { phone_e164?: string; status?: string } })[];
        }
      | undefined,
    ];
    const total = facetResult?.metadata?.[0]?.total ?? 0;
    const data = facetResult?.data ?? [];

    const items: RiderWithUser[] = data.map((doc) => ({
      rider: this.toEntity(doc),
      phoneE164: doc.user?.phone_e164 ?? '',
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
      ratingAverage: deriveAverage(doc.rating_sum, ratingCount, doc.rating_average),
      ratingCount,
      ratingSum: doc.rating_sum ?? 0,
      trustScore: doc.trust_score ?? null,
      trustTier: (doc.trust_tier as TrustTier | null | undefined) ?? null,
      trustBreakdown: (doc.trust_breakdown as TrustScoreBreakdownDto | null | undefined) ?? null,
      trustUpdatedAt: doc.trust_updated_at ?? null,
      version: doc.version,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }
}
