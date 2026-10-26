import type { DriverEntity, DriverRepositoryPort } from '../../domain/index.js';
import { DriverModel, type DriverDocument } from './driver.model.js';
import { AppError } from '../../../../shared/errors/AppError.js';

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
    const ratingCount = driver.ratingCount > 0 ? driver.ratingCount : 0;
    const ratingAverage = ratingCount > 0 ? driver.ratingAverage : null;
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
        rating_average: ratingAverage,
        rating_count: ratingCount,
        trust_score: driver.trustScore,
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
    for (let attempt = 0; attempt < 6; attempt++) {
      const doc = await DriverModel.findById(driverId).lean<DriverDocument | null>().exec();
      if (!doc) {
        throw AppError.notFound('DRIVER_NOT_FOUND: Driver profile not found.');
      }
      const prevCount = doc.rating_count > 0 ? doc.rating_count : 0;
      const prevAvg = prevCount > 0 && doc.rating_average !== null ? doc.rating_average : 0;
      const nextCount = prevCount + 1;
      const nextAvg = Number(((prevAvg * prevCount + stars) / nextCount).toFixed(2));
      const updated = await DriverModel.findOneAndUpdate(
        { _id: driverId, version: doc.version },
        {
          $set: {
            rating_count: nextCount,
            rating_average: nextAvg,
            version: doc.version + 1,
          },
        },
        { new: true },
      )
        .lean<DriverDocument | null>()
        .exec();
      if (updated) {
        return {
          ratingAverage: updated.rating_average ?? nextAvg,
          ratingCount: updated.rating_count,
        };
      }
    }
    throw AppError.conflict('RATING_AGGREGATE_CONFLICT: Driver rating aggregate retry exhausted.');
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
      ratingAverage: ratingCount > 0 ? doc.rating_average : null,
      ratingCount,
      trustScore: doc.trust_score,
      currentVehicleId: doc.current_vehicle_id,
      walletId: doc.wallet_id,
      version: doc.version,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }
}
