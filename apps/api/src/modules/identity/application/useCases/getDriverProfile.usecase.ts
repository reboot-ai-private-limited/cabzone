import type { KycComplianceSummaryDto } from '@cabzone/contracts';
import {
  evaluateDriverKycCompliance,
  type DriverApplicationEntity,
  type DriverApplicationRepositoryPort,
  type DriverDocumentEntity,
  type DriverDocumentRepositoryPort,
  type DriverEntity,
  type DriverRepositoryPort,
  type VehicleEntity,
  type VehicleRepositoryPort,
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
  compliance: KycComplianceSummaryDto;
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
        compliance: evaluateDriverKycCompliance({
          driver: null,
          vehicle: null,
          application: null,
          documents: [],
        }),
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
      compliance: evaluateDriverKycCompliance({
        driver,
        vehicle,
        application,
        documents,
      }),
    };
  }
}
