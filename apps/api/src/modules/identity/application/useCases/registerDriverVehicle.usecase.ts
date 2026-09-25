import type { VehicleCategory } from '@cabzone/contracts';
import { newUuid } from '../../../../shared/ids.js';
import { AppError } from '../../../../shared/errors/AppError.js';
import type {
  DriverRepositoryPort,
  VehicleEntity,
  VehicleRepositoryPort,
} from '../../domain/index.js';

export interface RegisterDriverVehicleDeps {
  driverRepo: DriverRepositoryPort;
  vehicleRepo: VehicleRepositoryPort;
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

    return vehicle;
  }
}
