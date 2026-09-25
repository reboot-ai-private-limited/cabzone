import { newUuid } from '../../../../shared/ids.js';
import { AppError } from '../../../../shared/errors/AppError.js';
import type {
  DriverApplicationEntity,
  DriverApplicationRepositoryPort,
  DriverRepositoryPort,
} from '../../domain/index.js';

export interface CreateDriverApplicationDeps {
  driverRepo: DriverRepositoryPort;
  applicationRepo: DriverApplicationRepositoryPort;
}

export class CreateDriverApplicationUseCase {
  constructor(private readonly deps: CreateDriverApplicationDeps) {}

  async execute(userId: string): Promise<DriverApplicationEntity> {
    const driver = await this.deps.driverRepo.findByUserId(userId);
    if (!driver) {
      throw AppError.notFound('Driver profile not found. Please create a driver profile first.');
    }

    const existing = await this.deps.applicationRepo.findByDriverId(driver.id);
    if (existing && ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW_AUTO', 'UNDER_REVIEW_ADMIN'].includes(existing.status)) {
      return existing;
    }

    const now = new Date();
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

    return this.deps.applicationRepo.create(newApp);
  }
}
