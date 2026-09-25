import type { VehicleEntity } from './vehicle.entity.js';

export interface VehicleRepositoryPort {
  findById(id: string): Promise<VehicleEntity | null>;
  findByDriverId(driverId: string): Promise<VehicleEntity | null>;
  findByRegistrationNumber(registrationNumber: string): Promise<VehicleEntity | null>;
  create(vehicle: VehicleEntity): Promise<VehicleEntity>;
  update(vehicle: VehicleEntity): Promise<VehicleEntity>;
}
