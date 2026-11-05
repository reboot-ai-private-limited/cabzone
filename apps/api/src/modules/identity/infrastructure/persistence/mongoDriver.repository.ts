import type { TrustScoreBreakdownDto, TrustTier } from '@cabzone/contracts';
import type { DriverEntity, DriverRepositoryPort, TrustSnapshot } from '../../domain/index.js';
import { DriverModel, type DriverDocument } from './driver.model.js';
import { AppError } from '../../../../shared/errors/AppError.js';

/** Prefers sum / count so the average never drifts; falls back to the stored average for older rows. */
function deriveAverage(sum: number | undefined, count: number, stored: number | null): number | null {
  if (count <= 0) return null;
  if (typeof sum === 'number' && sum > 0) return Number((sum / count).toFixed(2));
  return stored;
}

export class MongoDriverRepository implements DriverRepositoryPort {
  async findById(driverId: string): Promise<DriverEntity | null> {
    const doc = await DriverModel.findById(driverId).lean<DriverDocument | null>().exec();
    if (!doc) return null;
    return this.toEntity(doc);
  }

  async findByUserId(userId: string): Promise<DriverEntity | null> {
    const doc = await DriverModel.findOne({ user_id: userId }).lean<DriverDocument | null>().exec();
    if (!doc) return null;
    return this.toEntity(doc);
  }

  async create(driver: DriverEntity): Promise<DriverEntity> {
    const ratingCount = driver.ratingCount > 0 ? driver.ratingCount : 0;
    const ratingAverage = ratingCount > 0 ? driver.ratingAverage : null;
    const created = await DriverModel.create({
      _id: driver.id,
      user_id: driver.userId,
      name: driver.name ?? null,
      profile_photo_url: driver.profilePhotoUrl ?? null,
      alternate_phone: driver.alternatePhone ?? null,
      gender: driver.gender ?? null,
      date_of_birth: driver.dateOfBirth ?? null,
      experience: driver.experience ?? null,
      emergency_contact: driver.emergencyContact ?? null,
      address: driver.address ?? null,
      dl_number: driver.dlNumber ?? null,
      dl_expiry: driver.dlExpiry ?? null,
      status: driver.status,
      kyc_status: driver.kycStatus,
      operational_status: driver.operationalStatus,
      rating_average: ratingAverage,
      rating_count: ratingCount,
      trust_score: driver.trustScore,
      current_vehicle_id: driver.currentVehicleId,
      wallet_id: driver.walletId,
      version: driver.version,
    });
    return this.toEntity(created.toObject() as DriverDocument);
  }

  async update(driver: DriverEntity): Promise<DriverEntity> {
    // Ratings and trust are written only by applyRevealedRating / saveTrust, so a stale profile
    // object can never overwrite them.
    const updated = await DriverModel.findOneAndUpdate(
      { _id: driver.id, version: driver.version },
      {
        name: driver.name ?? null,
        profile_photo_url: driver.profilePhotoUrl ?? null,
        alternate_phone: driver.alternatePhone ?? null,
        gender: driver.gender ?? null,
        date_of_birth: driver.dateOfBirth ?? null,
        experience: driver.experience ?? null,
        emergency_contact: driver.emergencyContact ?? null,
        address: driver.address ?? null,
        dl_number: driver.dlNumber ?? null,
        dl_expiry: driver.dlExpiry ?? null,
        status: driver.status,
        kyc_status: driver.kycStatus,
        operational_status: driver.operationalStatus,
        current_vehicle_id: driver.currentVehicleId,
        version: driver.version + 1,
      },
      { new: true },
    )
      .lean<DriverDocument | null>()
      .exec();

    if (!updated) throw new Error(`Driver not found: ${driver.id}`);
    return this.toEntity(updated);
  }

  async applyRevealedRating(
    driverId: string,
    stars: number,
  ): Promise<{ ratingAverage: number; ratingCount: number }> {
    // One atomic pipeline update: the sum and count move together and the average is derived from
    // them, so concurrent reveals cannot lose a rating or accumulate rounding error (F10).
    // Profiles that predate rating_sum fall back to average x count for their first update.
    const updated = await DriverModel.findByIdAndUpdate(
      driverId,
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
      .lean<DriverDocument | null>()
      .exec();
    if (!updated) {
      throw AppError.notFound('DRIVER_NOT_FOUND: Driver profile not found.');
    }
    return { ratingAverage: updated.rating_average ?? 0, ratingCount: updated.rating_count };
  }

  async findManyByIds(ids: string[]): Promise<DriverEntity[]> {
    if (ids.length === 0) return [];
    const docs = await DriverModel.find({ _id: { $in: ids } }).lean<DriverDocument[]>().exec();
    return docs.map((d) => this.toEntity(d));
  }

  async saveTrust(id: string, trust: TrustSnapshot): Promise<void> {
    await DriverModel.updateOne(
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
    const docs = await DriverModel.find(afterId ? { _id: { $gt: afterId } } : {})
      .sort({ _id: 1 })
      .limit(limit)
      .select('_id')
      .lean<{ _id: string }[]>()
      .exec();
    return docs.map((d) => d._id);
  }

  private toEntity(doc: DriverDocument): DriverEntity {
    const ratingCount = doc.rating_count > 0 ? doc.rating_count : 0;
    return {
      id: doc._id,
      userId: doc.user_id,
      name: doc.name ?? null,
      profilePhotoUrl: doc.profile_photo_url ?? null,
      alternatePhone: doc.alternate_phone ?? null,
      gender: doc.gender ?? null,
      dateOfBirth: doc.date_of_birth ?? null,
      experience: doc.experience ?? null,
      emergencyContact: doc.emergency_contact ?? null,
      address: doc.address ?? null,
      dlNumber: doc.dl_number ?? null,
      dlExpiry: doc.dl_expiry ?? null,
      status: doc.status,
      kycStatus: doc.kyc_status,
      operationalStatus: doc.operational_status,
      ratingAverage: deriveAverage(doc.rating_sum, ratingCount, doc.rating_average),
      ratingCount,
      ratingSum: doc.rating_sum ?? 0,
      trustScore: doc.trust_score,
      trustTier: (doc.trust_tier as TrustTier | null | undefined) ?? null,
      trustBreakdown: (doc.trust_breakdown as TrustScoreBreakdownDto | null | undefined) ?? null,
      trustUpdatedAt: doc.trust_updated_at ?? null,
      currentVehicleId: doc.current_vehicle_id,
      walletId: doc.wallet_id,
      version: doc.version,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }
}
