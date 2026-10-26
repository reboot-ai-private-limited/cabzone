import type { VehicleCategory } from '@cabzone/contracts';
import { newUuid } from '../../../../shared/ids.js';
import { AppError } from '../../../../shared/errors/AppError.js';
import {
  isVehicleScopedDocumentType,
  type DriverApplicationRepositoryPort,
  type DriverDocumentRepositoryPort,
  type DriverRepositoryPort,
  type VehicleEntity,
  type VehicleRepositoryPort,
} from '../../domain/index.js';

export interface RegisterDriverVehicleDeps {
  driverRepo: DriverRepositoryPort;
  vehicleRepo: VehicleRepositoryPort;
  applicationRepo?: DriverApplicationRepositoryPort | undefined;
  documentRepo?: DriverDocumentRepositoryPort | undefined;
}

export interface RegisterDriverVehicleDto {
  userId: string;
  vehicleType: VehicleCategory;
  make: string;
  model: string;
  registrationNumber: string;
  color?: string | null | undefined;
  manufactureYear?: number | null | undefined;
}

export class RegisterDriverVehicleUseCase {
  constructor(private readonly deps: RegisterDriverVehicleDeps) {}

  async execute(dto: RegisterDriverVehicleDto): Promise<VehicleEntity> {
    const driver = await this.deps.driverRepo.findByUserId(dto.userId);
    if (!driver) {
      throw AppError.notFound('Driver profile not found.');
    }

    const normalizedReg = dto.registrationNumber.trim().toUpperCase();
    const existingVehicle = await this.deps.vehicleRepo.findByRegistrationNumber(normalizedReg);
    if (existingVehicle && existingVehicle.driverId !== driver.id) {
      throw AppError.conflict('Vehicle with this registration number is already registered.');
    }

    const now = new Date();
    let vehicle: VehicleEntity;

    if (existingVehicle && existingVehicle.driverId === driver.id) {
      const updated: VehicleEntity = {
        ...existingVehicle,
        vehicleType: dto.vehicleType,
        make: dto.make,
        model: dto.model,
        color: dto.color ?? existingVehicle.color,
        manufactureYear: dto.manufactureYear ?? existingVehicle.manufactureYear,
        verificationStatus: 'PENDING',
        updatedAt: now,
      };
      vehicle = await this.deps.vehicleRepo.update(updated);
    } else {
      const newVehicle: VehicleEntity = {
        id: newUuid(),
        driverId: driver.id,
        vehicleType: dto.vehicleType,
        make: dto.make,
        model: dto.model,
        registrationNumber: normalizedReg,
        color: dto.color ?? null,
        manufactureYear: dto.manufactureYear ?? null,
        verificationStatus: 'PENDING',
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      vehicle = await this.deps.vehicleRepo.create(newVehicle);
    }

    if (driver.currentVehicleId !== vehicle.id) {
      await this.deps.driverRepo.update({
        ...driver,
        currentVehicleId: vehicle.id,
      });
    }

    if (this.deps.applicationRepo && this.deps.documentRepo) {
      const activeApp = await this.deps.applicationRepo.findByDriverId(driver.id);
      if (activeApp && ['DRAFT', 'REAPPLIED'].includes(activeApp.status)) {
        const docs = await this.deps.documentRepo.findByApplicationId(activeApp.id);
        for (const doc of docs) {
          if (
            isVehicleScopedDocumentType(doc.type) &&
            doc.verificationStatus === 'PENDING' &&
            doc.vehicleId == null
          ) {
            await this.deps.documentRepo.update({
              ...doc,
              vehicleId: vehicle.id,
              updatedAt: now,
            });
          }
        }
      }
    }

    return vehicle;
  }
}
