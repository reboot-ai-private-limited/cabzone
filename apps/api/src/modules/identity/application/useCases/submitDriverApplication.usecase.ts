import { DOCUMENT_TYPES } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import {
  canSubmitApplication,
  isVehicleScopedDocumentType,
  type DriverApplicationEntity,
  type DriverApplicationRepositoryPort,
  type DriverDocumentRepositoryPort,
  type DriverRepositoryPort,
  type VehicleRepositoryPort,
} from '../../domain/index.js';

export interface SubmitDriverApplicationDeps {
  driverRepo: DriverRepositoryPort;
  applicationRepo: DriverApplicationRepositoryPort;
  documentRepo: DriverDocumentRepositoryPort;
  vehicleRepo: VehicleRepositoryPort;
}

export class SubmitDriverApplicationUseCase {
  constructor(private readonly deps: SubmitDriverApplicationDeps) {}

  async execute(userId: string): Promise<DriverApplicationEntity> {
    const driver = await this.deps.driverRepo.findByUserId(userId);
    if (!driver) {
      throw AppError.notFound('Driver profile not found.');
    }

    const application = await this.deps.applicationRepo.findByDriverId(driver.id);
    if (!application) {
      throw AppError.badRequest('No application found to submit.');
    }

    if (!canSubmitApplication(application)) {
      throw AppError.badRequest(
        `Cannot submit application with current status ${application.status}.`,
      );
    }

    const docs = await this.deps.documentRepo.findByApplicationId(application.id);
    const hasGovtId = docs.some((d) => d.type === 'GOVERNMENT_ID' && !d.storageKey.startsWith('mock/'));
    const hasLicense = docs.some((d) => d.type === 'DRIVING_LICENSE' && !d.storageKey.startsWith('mock/'));

    if (!hasGovtId || !hasLicense) {
      throw AppError.badRequest(
        'Both Government ID and Driving License must be uploaded before submitting.',
      );
    }

    if (!driver.currentVehicleId) {
      throw AppError.badRequest(
        'A vehicle must be registered before submitting the driver application.',
      );
    }

    const vehicle = await this.deps.vehicleRepo.findById(driver.currentVehicleId);
    if (!vehicle) {
      throw AppError.badRequest('Registered vehicle not found.');
    }

    const now = new Date();
    const missing = DOCUMENT_TYPES.filter(
      (type) =>
        !docs.some(
          (doc) =>
            doc.type === type &&
            !doc.storageKey.startsWith('mock/') &&
            (!isVehicleScopedDocumentType(type) ||
              doc.vehicleId == null ||
              doc.vehicleId === vehicle.id) &&
            (type === 'GOVERNMENT_ID'
              ? !doc.expiresAt || doc.expiresAt > now
              : doc.expiresAt !== null && doc.expiresAt > now),
        ),
    );
    if (missing.length > 0) {
      throw AppError.badRequest(
        `DOCUMENTS_REQUIRED: Upload current ${missing.join(', ')} before submitting.`,
      );
    }

    if (
      docs.every((doc) => doc.verificationStatus === 'VERIFIED') &&
      vehicle.verificationStatus === 'APPROVED' &&
      driver.status === 'ACTIVE'
    ) {
      throw AppError.badRequest(
        'RENEWAL_DOCUMENT_REQUIRED: Upload at least one updated document before submitting a renewal.',
      );
    }

    for (const doc of docs) {
      if (isVehicleScopedDocumentType(doc.type) && doc.vehicleId == null) {
        await this.deps.documentRepo.update({
          ...doc,
          vehicleId: vehicle.id,
          updatedAt: now,
        });
      }
    }

    const updatedApp: DriverApplicationEntity = {
      ...application,
      status: 'SUBMITTED',
      submittedAt: now,
    };

    return this.deps.applicationRepo.update(updatedApp);
  }
}
