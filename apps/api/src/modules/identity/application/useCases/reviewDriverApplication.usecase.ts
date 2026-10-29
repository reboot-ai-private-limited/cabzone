import type { RejectionType } from '@cabzone/contracts';
import { DOCUMENT_TYPES } from '@cabzone/contracts';
import { newUuid } from '../../../../shared/ids.js';
import { AppError } from '../../../../shared/errors/AppError.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import {
  REQUIRED_DRIVER_DOCUMENT_TYPES,
  isDocumentValidForVehicle,
  isVehicleApproved,
  isVehicleScopedDocumentType,
  type DriverApplicationEntity,
  type DriverApplicationRepositoryPort,
  type DriverDocumentRepositoryPort,
  type DriverRepositoryPort,
  type KycAuditRepositoryPort,
  type VehicleRepositoryPort,
} from '../../domain/index.js';

export interface ReviewDriverApplicationDeps {
  unitOfWork: UnitOfWorkPort;
  driverRepo: DriverRepositoryPort;
  applicationRepo: DriverApplicationRepositoryPort;
  documentRepo: DriverDocumentRepositoryPort;
  vehicleRepo: VehicleRepositoryPort;
  auditRepo?: KycAuditRepositoryPort | undefined;
  removeDriverPresence?: ((driverId: string) => Promise<void>) | undefined;
}

export interface ReviewDriverApplicationDto {
  applicationId: string;
  reviewerAdminId: string;
  reviewerRole?: string | undefined;
  status: 'APPROVED' | 'REJECTED';
  rejectionType?: RejectionType | null | undefined;
  rejectionReason?: string | null | undefined;
}

export class ReviewDriverApplicationUseCase {
  constructor(private readonly deps: ReviewDriverApplicationDeps) {}

  async execute(dto: ReviewDriverApplicationDto): Promise<DriverApplicationEntity> {
    const savedApp = await this.deps.unitOfWork.run(() => this.review(dto));

    if (dto.status === 'REJECTED' && dto.rejectionType === 'HARD_FRAUD') {
      await this.deps.removeDriverPresence?.(savedApp.driverId);
    }

    if (this.deps.auditRepo) {
      await this.deps.auditRepo.record({
        id: newUuid(),
        actorUserId: dto.reviewerAdminId,
        actorRole: dto.reviewerRole ?? 'ADMIN',
        action: dto.status === 'APPROVED' ? 'APPLICATION_APPROVED' : 'APPLICATION_REJECTED',
        driverId: savedApp.driverId,
        applicationId: savedApp.id,
        documentId: null,
        metadata:
          dto.status === 'REJECTED'
            ? {
                rejectionType: dto.rejectionType ?? null,
                rejectionReason: dto.rejectionReason ?? null,
              }
            : null,
        createdAt: new Date(),
      });
    }

    return savedApp;
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
      const vehicle = driver.currentVehicleId
        ? await this.deps.vehicleRepo.findById(driver.currentVehicleId)
        : null;
      if (!vehicle || vehicle.driverId !== driver.id) {
        throw AppError.badRequest(
          'DRIVER_VEHICLE_REQUIRED: A vehicle owned by this driver is required.',
        );
      }

      const docs = await this.deps.documentRepo.findByApplicationId(application.id);
      const missing = DOCUMENT_TYPES.filter(
        (type) =>
          !docs.some(
            (doc) =>
              doc.type === type &&
              !doc.storageKey.startsWith('mock/') &&
              (!isVehicleScopedDocumentType(type) ||
                doc.vehicleId == null ||
                doc.vehicleId === vehicle.id),
          ),
      );
      if (missing.length > 0) {
        throw AppError.badRequest(
          `DOCUMENTS_REQUIRED: Cannot approve without ${missing.join(', ')} for the active vehicle.`,
        );
      }
      if (docs.some((doc) => doc.type !== 'GOVERNMENT_ID' && doc.expiresAt === null)) {
        throw AppError.badRequest(
          'DOCUMENT_EXPIRY_REQUIRED: DL, RC, insurance and permit require expiry dates.',
        );
      }
      if (docs.some((doc) => doc.expiresAt !== null && doc.expiresAt <= now)) {
        throw AppError.badRequest('DOCUMENT_EXPIRED: Replace expired documents before approval.');
      }

      const updatedApp: DriverApplicationEntity = {
        ...application,
        status: 'APPROVED',
        rejectionType: null,
        rejectionReason: null,
        reviewedAt: now,
        reviewerAdminId: dto.reviewerAdminId,
      };

      const savedApp = await this.deps.applicationRepo.update(updatedApp);

      const dlDoc = docs.find((d) => d.type === 'DRIVING_LICENSE');
      const syncedDlExpiry = dlDoc?.expiresAt
        ? dlDoc.expiresAt.toISOString().slice(0, 10)
        : driver.dlExpiry;

      await this.deps.driverRepo.update({
        ...driver,
        dlExpiry: syncedDlExpiry,
        kycStatus: 'VERIFIED',
        status: 'ACTIVE',
      });

      await this.deps.vehicleRepo.update({
        ...vehicle,
        verificationStatus: 'APPROVED',
      });

      for (const doc of docs) {
        await this.deps.documentRepo.update({
          ...doc,
          vehicleId: isVehicleScopedDocumentType(doc.type) ? vehicle.id : null,
          verificationStatus: 'VERIFIED',
          verifiedAt: now,
          lastExpiryReminderDays: null,
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

      if (dto.rejectionType === 'HARD_FRAUD') {
        await this.deps.driverRepo.update({
          ...driver,
          kycStatus: 'FAILED',
          status: 'REJECTED',
          operationalStatus:
            driver.operationalStatus === 'ONLINE' ? 'OFFLINE' : driver.operationalStatus,
        });
        return savedApp;
      }

      const [allDriverDocs, vehicle] = await Promise.all([
        this.deps.documentRepo.findByDriverId(driver.id),
        driver.currentVehicleId ? this.deps.vehicleRepo.findById(driver.currentVehicleId) : null,
      ]);

      const stillCompliantOnPriorDocs =
        driver.status === 'ACTIVE' &&
        vehicle !== null &&
        vehicle.id === driver.currentVehicleId &&
        isVehicleApproved(vehicle) &&
        REQUIRED_DRIVER_DOCUMENT_TYPES.every((type) =>
          allDriverDocs.some(
            (doc) =>
              doc.applicationId !== application.id &&
              doc.type === type &&
              isDocumentValidForVehicle(doc, driver.currentVehicleId, now),
          ),
        );

      const hasExpiredPriorDocs =
        driver.status === 'ACTIVE' &&
        allDriverDocs.some(
          (doc) =>
            doc.verificationStatus === 'EXPIRED' ||
            (doc.verificationStatus === 'VERIFIED' &&
              doc.expiresAt !== null &&
              doc.expiresAt <= now),
        );

      const nextKycStatus = stillCompliantOnPriorDocs
        ? 'VERIFIED'
        : hasExpiredPriorDocs
          ? 'EXPIRED'
          : 'FAILED';

      await this.deps.driverRepo.update({
        ...driver,
        kycStatus: nextKycStatus,
        operationalStatus:
          nextKycStatus !== 'VERIFIED' && driver.operationalStatus === 'ONLINE'
            ? 'OFFLINE'
            : driver.operationalStatus,
      });

      return savedApp;
    }
  }
}
