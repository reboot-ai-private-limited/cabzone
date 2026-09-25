import type { DocumentType } from '@cabzone/contracts';
import { newUuid } from '../../../../shared/ids.js';
import { AppError } from '../../../../shared/errors/AppError.js';
import type {
  DriverApplicationRepositoryPort,
  DriverDocumentEntity,
  DriverDocumentRepositoryPort,
  DriverRepositoryPort,
} from '../../domain/index.js';

export interface UploadDriverDocumentDeps {
  driverRepo: DriverRepositoryPort;
  applicationRepo: DriverApplicationRepositoryPort;
  documentRepo: DriverDocumentRepositoryPort;
}

export interface UploadDriverDocumentDto {
  userId: string;
  type: DocumentType;
  storageKey: string;
  documentHash: string;
  documentNumberMasked?: string | null | undefined;
  issuedAt?: Date | null | undefined;
  expiresAt?: Date | null | undefined;
}

export class UploadDriverDocumentUseCase {
  constructor(private readonly deps: UploadDriverDocumentDeps) {}

  async execute(dto: UploadDriverDocumentDto): Promise<DriverDocumentEntity> {
    const driver = await this.deps.driverRepo.findByUserId(dto.userId);
    if (!driver) {
      throw AppError.notFound('Driver profile not found.');
    }

    const application = await this.deps.applicationRepo.findByDriverId(driver.id);
    if (!application) {
      throw AppError.badRequest('No active application found. Please initiate an application first.');
    }

    if (!['DRAFT', 'REAPPLIED'].includes(application.status)) {
      throw AppError.badRequest(
        `Cannot upload documents while application is under ${application.status}.`,
      );
    }

    const existingDocs = await this.deps.documentRepo.findByApplicationId(application.id);
    const existing = existingDocs.find((d) => d.type === dto.type);
    const now = new Date();

    if (existing) {
      const updated: DriverDocumentEntity = {
        ...existing,
        storageKey: dto.storageKey,
        documentHash: dto.documentHash,
        documentNumberMasked: dto.documentNumberMasked ?? existing.documentNumberMasked,
        issuedAt: dto.issuedAt ?? existing.issuedAt,
        expiresAt: dto.expiresAt ?? existing.expiresAt,
        verificationStatus: 'PENDING',
        verifiedAt: null,
        updatedAt: now,
      };
      return this.deps.documentRepo.update(updated);
    }

    const newDoc: DriverDocumentEntity = {
      id: newUuid(),
      driverId: driver.id,
      applicationId: application.id,
      type: dto.type,
      storageKey: dto.storageKey,
      documentHash: dto.documentHash,
      documentNumberMasked: dto.documentNumberMasked ?? null,
      issuedAt: dto.issuedAt ?? null,
      expiresAt: dto.expiresAt ?? null,
      verificationStatus: 'PENDING',
      verifiedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    return this.deps.documentRepo.create(newDoc);
  }
}
