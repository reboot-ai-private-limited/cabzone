import type { VehicleEntity, VehicleRepositoryPort } from '../../domain/index.js';
import { VehicleModel, type VehicleDocument } from './vehicle.model.js';

export class MongoVehicleRepository implements VehicleRepositoryPort {
  async findById(id: string): Promise<VehicleEntity | null> {
    const doc = await VehicleModel.findById(id).lean<VehicleDocument | null>().exec();
    if (!doc) return null;
    return this.toEntity(doc);
  }

  async findByDriverId(driverId: string): Promise<VehicleEntity | null> {
    const doc = await VehicleModel.findOne({ driver_id: driverId }).lean<VehicleDocument | null>().exec();
    if (!doc) return null;
    return this.toEntity(doc);
  }

  async findByRegistrationNumber(registrationNumber: string): Promise<VehicleEntity | null> {
    const doc = await VehicleModel.findOne({ registration_number: registrationNumber })
      .lean<VehicleDocument | null>()
      .exec();
    if (!doc) return null;
    return this.toEntity(doc);
  }

  async create(vehicle: VehicleEntity): Promise<VehicleEntity> {
    const created = await VehicleModel.create({
      _id: vehicle.id,
      driver_id: vehicle.driverId,
      vehicle_type: vehicle.vehicleType,
      make: vehicle.make,
      model: vehicle.model,
      registration_number: vehicle.registrationNumber,
      color: vehicle.color,
      manufacture_year: vehicle.manufactureYear,
      verification_status: vehicle.verificationStatus,
      version: vehicle.version,
    });
    return this.toEntity(created.toObject() as unknown as VehicleDocument);
  }

  async update(vehicle: VehicleEntity): Promise<VehicleEntity> {
    const updated = await VehicleModel.findByIdAndUpdate(
      vehicle.id,
      {
        make: vehicle.make,
        model: vehicle.model,
        color: vehicle.color,
        manufacture_year: vehicle.manufactureYear,
        verification_status: vehicle.verificationStatus,
        version: vehicle.version + 1,
      },
      { new: true },
    )
      .lean<VehicleDocument | null>()
      .exec();

    if (!updated) throw new Error(`Vehicle not found: ${vehicle.id}`);
    return this.toEntity(updated);
  }

  private toEntity(doc: VehicleDocument): VehicleEntity {
    return {
      id: doc._id,
      driverId: doc.driver_id,
      vehicleType: doc.vehicle_type,
      make: doc.make,
      model: doc.model,
      registrationNumber: doc.registration_number,
      color: doc.color,
      manufactureYear: doc.manufacture_year,
      verificationStatus: doc.verification_status,
      version: doc.version,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }
}
