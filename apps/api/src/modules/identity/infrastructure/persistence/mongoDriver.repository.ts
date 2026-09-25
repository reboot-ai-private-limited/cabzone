import type { DriverEntity, DriverRepositoryPort } from '../../domain/index.js';
import { DriverModel, type DriverDocument } from './driver.model.js';

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
    const created = await DriverModel.create({
      _id: driver.id,
      user_id: driver.userId,
      status: driver.status,
      kyc_status: driver.kycStatus,
      operational_status: driver.operationalStatus,
      rating_average: driver.ratingAverage,
      rating_count: driver.ratingCount,
      trust_score: driver.trustScore,
      current_vehicle_id: driver.currentVehicleId,
      wallet_id: driver.walletId,
      version: driver.version,
    });
    return this.toEntity(created.toObject() as DriverDocument);
  }

  async update(driver: DriverEntity): Promise<DriverEntity> {
    const updated = await DriverModel.findByIdAndUpdate(
      driver.id,
      {
        status: driver.status,
        kyc_status: driver.kycStatus,
        operational_status: driver.operationalStatus,
        rating_average: driver.ratingAverage,
        rating_count: driver.ratingCount,
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

  private toEntity(doc: DriverDocument): DriverEntity {
    return {
      id: doc._id,
      userId: doc.user_id,
      status: doc.status,
      kycStatus: doc.kyc_status,
      operationalStatus: doc.operational_status,
      ratingAverage: doc.rating_average,
      ratingCount: doc.rating_count,
      trustScore: doc.trust_score,
      currentVehicleId: doc.current_vehicle_id,
      walletId: doc.wallet_id,
      version: doc.version,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }
}
