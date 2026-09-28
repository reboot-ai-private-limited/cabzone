import type { RejectionType } from '@Cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import type {
  DriverApplicationEntity,
  DriverApplicationRepositoryPort,
  DriverDocumentRepositoryPort,
  DriverRepositoryPort,
  VehicleRepositoryPort,
} from '../../domain/index.js';

export interface ReviewDriverApplicationDeps {
  driverRepo: DriverRepositoryPort;
  applicationRepo: DriverApplicationRepositoryPort;
  documentRepo: DriverDocumentRepositoryPort;
  vehicleRepo: VehicleRepositoryPort;
}

export interface ReviewDriverApplicationDto {
  applicationId: string;
  reviewerAdminId: string;
  status: 'APPROVED' | 'REJECTED';
  rejectionType?: RejectionType | null | undefined;
  rejectionReason?: string | null | undefined;
}

export class ReviewDriverApplicationUseCase {
  constructor(private readonly deps: ReviewDriverApplicationDeps) {}

  async execute(dto: ReviewDriverApplicationDto): Promise<DriverApplicationEntity> {
    const application = await this.deps.applicationRepo.findById(dto.applicationId);
    if (!application) {
      throw AppError.notFound('Driver application not found.');
    }

    if (application.status === 'APPROVED' || application.status === 'REJECTED') {
      throw AppError.badRequest(`Application has already been reviewed with status ${application.status}.`);
    }

    const driver = await this.deps.driverRepo.findById(application.driverId);
    if (!driver) {
      throw AppError.notFound('Associated driver profile not found.');
    }

    const now = new Date();

    if (dto.status === 'APPROVED') {
      const updatedApp: DriverApplicationEntity = {
        ...application,
        status: 'APPROVED',
        rejectionType: null,
        rejectionReason: null,
        reviewedAt: now,
        reviewerAdminId: dto.reviewerAdminId,
      };

      const savedApp = await this.deps.applicationRepo.update(updatedApp);

      await this.deps.driverRepo.update({
        ...driver,
        kycStatus: 'VERIFIED',
        status: 'ACTIVE',
      });

      if (driver.currentVehicleId) {
        const vehicle = await this.deps.vehicleRepo.findById(driver.currentVehicleId);
        if (vehicle) {
          await this.deps.vehicleRepo.update({
            ...vehicle,
            verificationStatus: 'APPROVED',
          });
        }
      }

      const docs = await this.deps.documentRepo.findByApplicationId(application.id);
      for (const doc of docs) {
        await this.deps.documentRepo.update({
          ...doc,
          verificationStatus: 'VERIFIED',
          verifiedAt: now,
        });
      }

      return savedApp;
    } else {
      if (!dto.rejectionType || !dto.rejectionReason) {
        throw AppError.badRequest('Rejection requires both rejectionType and rejectionReason.');
      }

      const updatedApp: DriverApplicationEntity = {
        ...application,
        status: 'REJECTED',
        rejectionType: dto.rejectionType,
        rejectionReason: dto.rejectionReason,
        reviewedAt: now,
        reviewerAdminId: dto.reviewerAdminId,
      };

      const savedApp = await this.deps.applicationRepo.update(updatedApp);

      const driverStatus = dto.rejectionType === 'HARD_FRAUD' ? 'REJECTED' : driver.status;
      await this.deps.driverRepo.update({
        ...driver,
        kycStatus: 'FAILED',
        status: driverStatus,
      });

      return savedApp;
    }
  }
}
