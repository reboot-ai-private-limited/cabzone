import type { RejectionType } from '@cabzone/contracts';
import { DOCUMENT_TYPES } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import type {
  DriverApplicationEntity,
  DriverApplicationRepositoryPort,
  DriverDocumentRepositoryPort,
  DriverRepositoryPort,
  VehicleRepositoryPort,
} from '../../domain/index.js';

export interface ReviewDriverApplicationDeps {
  unitOfWork: UnitOfWorkPort;
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
    return this.deps.unitOfWork.run(() => this.review(dto));
  }

  private async review(dto: ReviewDriverApplicationDto): Promise<DriverApplicationEntity> {
    const application = await this.deps.applicationRepo.findById(dto.applicationId);
    if (!application) {
      throw AppError.notFound('Driver application not found.');
    }

    if (application.status === 'APPROVED' || application.status === 'REJECTED') {
      throw AppError.badRequest(
        `Application has already been reviewed with status ${application.status}.`,
      );
    }
    if (!['SUBMITTED', 'UNDER_REVIEW_AUTO', 'UNDER_REVIEW_ADMIN'].includes(application.status)) {
      throw AppError.badRequest(
        'APPLICATION_NOT_SUBMITTED: Only submitted applications can be reviewed.',
      );
    }

    const driver = await this.deps.driverRepo.findById(application.driverId);
    if (!driver) {
      throw AppError.notFound('Associated driver profile not found.');
    }

    const now = new Date();

    if (dto.status === 'APPROVED') {
      const docs = await this.deps.documentRepo.findByApplicationId(application.id);
      const missing = DOCUMENT_TYPES.filter((type) => !docs.some((doc) => doc.type === type && !doc.storageKey.startsWith('mock/')));
      if (missing.length > 0)
        throw AppError.badRequest(
          `DOCUMENTS_REQUIRED: Cannot approve without ${missing.join(', ')}.`,
        );
      if (docs.some((doc) => doc.type !== 'GOVERNMENT_ID' && doc.expiresAt === null)) {
        throw AppError.badRequest(
          'DOCUMENT_EXPIRY_REQUIRED: DL, RC, insurance and permit require expiry dates.',
        );
      }
      if (docs.some((doc) => doc.expiresAt !== null && doc.expiresAt <= now)) {
        throw AppError.badRequest('DOCUMENT_EXPIRED: Replace expired documents before approval.');
      }
      const vehicle = driver.currentVehicleId
        ? await this.deps.vehicleRepo.findById(driver.currentVehicleId)
        : null;
      if (!vehicle || vehicle.driverId !== driver.id)
        throw AppError.badRequest(
          'DRIVER_VEHICLE_REQUIRED: A vehicle owned by this driver is required.',
        );
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
