import { newUuid } from '../../../../shared/ids.js';
import { AppError } from '../../../../shared/errors/AppError.js';
import {
  REQUIRED_DRIVER_DOCUMENT_TYPES,
  canDriverReapply,
  evaluateDriverKycCompliance,
  isDocumentValidForVehicle,
  isVehicleScopedDocumentType,
  type DriverApplicationEntity,
  type DriverApplicationRepositoryPort,
  type DriverDocumentRepositoryPort,
  type DriverRepositoryPort,
  type VehicleRepositoryPort,
} from '../../domain/index.js';

export interface CreateDriverApplicationDeps {
  driverRepo: DriverRepositoryPort;
  applicationRepo: DriverApplicationRepositoryPort;
  documentRepo?: DriverDocumentRepositoryPort | undefined;
  vehicleRepo?: VehicleRepositoryPort | undefined;
}

export interface CreateDriverApplicationOptions {
  allowApprovedRenewal?: boolean | undefined;
}

export class CreateDriverApplicationUseCase {
  constructor(private readonly deps: CreateDriverApplicationDeps) {}

  async execute(
    userId: string,
    options?: CreateDriverApplicationOptions,
  ): Promise<DriverApplicationEntity> {
    const driver = await this.deps.driverRepo.findByUserId(userId);
    if (!driver) {
      throw AppError.notFound('Driver profile not found. Please create a driver profile first.');
    }

    const existing = await this.deps.applicationRepo.findByDriverId(driver.id);
    if (
      driver.status === 'REJECTED' ||
      driver.status === 'SUSPENDED' ||
      existing?.rejectionType === 'HARD_FRAUD'
    ) {
      throw AppError.forbidden('DRIVER_PERMANENTLY_REJECTED: Account is not eligible to apply.');
    }

    if (
      existing &&
      ['DRAFT', 'REAPPLIED', 'SUBMITTED', 'UNDER_REVIEW_AUTO', 'UNDER_REVIEW_ADMIN'].includes(
        existing.status,
      )
    ) {
      return existing;
    }

    const now = new Date();
    const priorDocs = this.deps.documentRepo
      ? await this.deps.documentRepo.findByDriverId(driver.id)
      : [];

    if (existing?.status === 'APPROVED') {
      const vehicle =
        driver.currentVehicleId && this.deps.vehicleRepo
          ? await this.deps.vehicleRepo.findById(driver.currentVehicleId)
          : null;
      const compliance = evaluateDriverKycCompliance({
        driver,
        vehicle,
        application: existing,
        documents: priorDocs,
        now,
      });
      const needsRenewal =
        options?.allowApprovedRenewal === true ||
        driver.kycStatus !== 'VERIFIED' ||
        compliance.overallStatus !== 'COMPLIANT';

      if (!needsRenewal) {
        throw AppError.conflict('DRIVER_ALREADY_APPROVED: No new application is required.');
      }
    }

    if (existing?.status === 'REJECTED') {
      const eligibility = canDriverReapply(existing);
      if (!eligibility.allowed) throw AppError.forbidden(eligibility.reason);
    }

    const newApp: DriverApplicationEntity = {
      id: newUuid(),
      driverId: driver.id,
      status: 'DRAFT',
      rejectionType: null,
      rejectionReason: null,
      verificationProvider: null,
      verificationReference: null,
      verificationResult: null,
      reapplyCount: existing?.status === 'REJECTED' ? existing.reapplyCount + 1 : 0,
      submittedAt: null,
      reviewedAt: null,
      reviewerAdminId: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const createdApp = await this.deps.applicationRepo.create(newApp);

    if (this.deps.documentRepo && priorDocs.length > 0) {
      for (const type of REQUIRED_DRIVER_DOCUMENT_TYPES) {
        const carryCandidate = priorDocs
          .filter(
            (doc) =>
              doc.type === type &&
              !doc.storageKey.startsWith('mock/') &&
              isDocumentValidForVehicle(doc, driver.currentVehicleId, now),
          )
          .sort((a, b) => {
            const aExp = a.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
            const bExp = b.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
            return bExp - aExp || b.updatedAt.getTime() - a.updatedAt.getTime();
          })[0];

        if (carryCandidate) {
          await this.deps.documentRepo.create({
            id: newUuid(),
            driverId: driver.id,
            applicationId: createdApp.id,
            vehicleId:
              carryCandidate.vehicleId ??
              (isVehicleScopedDocumentType(type) ? driver.currentVehicleId : null),
            type,
            storageKey: carryCandidate.storageKey,
            documentHash: carryCandidate.documentHash,
            documentNumberMasked: carryCandidate.documentNumberMasked,
            issuedAt: carryCandidate.issuedAt,
            expiresAt: carryCandidate.expiresAt,
            verificationStatus: 'VERIFIED',
            verifiedAt: carryCandidate.verifiedAt ?? now,
            lastExpiryReminderDays: carryCandidate.lastExpiryReminderDays ?? null,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    return createdApp;
  }
}
