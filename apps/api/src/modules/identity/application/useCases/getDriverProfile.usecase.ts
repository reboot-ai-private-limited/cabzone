import type {
  DriverApplicationEntity,
  DriverApplicationRepositoryPort,
  DriverDocumentEntity,
  DriverDocumentRepositoryPort,
  DriverEntity,
  DriverRepositoryPort,
  VehicleEntity,
  VehicleRepositoryPort,
} from '../../domain/index.js';

export interface GetDriverProfileDeps {
  driverRepo: DriverRepositoryPort;
  vehicleRepo: VehicleRepositoryPort;
  applicationRepo: DriverApplicationRepositoryPort;
  documentRepo: DriverDocumentRepositoryPort;
}

export interface DriverProfileDetail {
  driver: DriverEntity | null;
  vehicle: VehicleEntity | null;
  application: DriverApplicationEntity | null;
  documents: DriverDocumentEntity[];
}

export class GetDriverProfileUseCase {
  constructor(private readonly deps: GetDriverProfileDeps) {}

  async execute(userId: string): Promise<DriverProfileDetail> {
    const driver = await this.deps.driverRepo.findByUserId(userId);
    if (!driver) {
      return {
        driver: null,
        vehicle: null,
        application: null,
        documents: [],
      };
    }

    const [vehicle, application, documents] = await Promise.all([
      driver.currentVehicleId ? this.deps.vehicleRepo.findById(driver.currentVehicleId) : null,
      this.deps.applicationRepo.findByDriverId(driver.id),
      this.deps.documentRepo.findByDriverId(driver.id),
    ]);

    return {
      driver,
      vehicle,
      application,
      documents,
    };
  }
}
