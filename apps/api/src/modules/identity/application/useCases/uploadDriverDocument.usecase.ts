import type { DocumentType } from '@cabzone/contracts';
import { newUuid } from '../../../../shared/ids.js';
import { AppError } from '../../../../shared/errors/AppError.js';
import { parseDriverLicenseFile } from '../driverLicenseFile.js';
import type { DriverLicenseStoragePort } from '../../domain/driverLicenseStorage.port.js';
import {
  isVehicleScopedDocumentType,
  type DriverApplicationRepositoryPort,
  type DriverDocumentEntity,
  type DriverDocumentRepositoryPort,
  type DriverRepositoryPort,
} from '../../domain/index.js';

export interface UploadDriverDocumentDeps {
  driverRepo: DriverRepositoryPort;
  applicationRepo: DriverApplicationRepositoryPort;
  documentRepo: DriverDocumentRepositoryPort;
  licenseStorage?: DriverLicenseStoragePort;
}

export interface UploadDriverDocumentDto {
  userId: string;
  type: DocumentType;
  storageKey: string;
  documentHash: string;
  vehicleId?: string | null | undefined;
  documentNumberMasked?: string | null | undefined;
  issuedAt?: Date | null | undefined;
  expiresAt?: Date | null | undefined;
}

export class UploadDriverDocumentUseCase {
  constructor(private readonly deps: UploadDriverDocumentDeps) {}

  async executeLicenseFile(dto: {
    userId: string;
    fileDataUrl?: string | undefined;
    dlNumber: string;
    expiresAt: Date;
  }): Promise<DriverDocumentEntity> {
    const driver = await this.deps.driverRepo.findByUserId(dto.userId);
    if (!driver) throw AppError.notFound('Driver profile not found.');
    const application = await this.deps.applicationRepo.findByDriverId(driver.id);
    if (!application || !['DRAFT', 'REAPPLIED'].includes(application.status)) {
      throw AppError.badRequest('Start a draft application before uploading your licence.');
    }
    if (dto.expiresAt <= new Date()) throw AppError.badRequest('Licence expiry must be in the future.');
    if (!dto.fileDataUrl) {
      const documents = await this.deps.documentRepo.findByApplicationId(application.id);
      const existing = documents.find((document) => document.type === 'DRIVING_LICENSE');
      if (
        !existing ||
        existing.storageKey.startsWith('mock/') ||
        existing.documentNumberMasked !== `****${dto.dlNumber.slice(-4)}`
      ) {
        throw AppError.badRequest('Select the licence file for this licence number.');
      }
      return this.execute({
        userId: dto.userId,
        type: 'DRIVING_LICENSE',
        storageKey: existing.storageKey,
        documentHash: existing.documentHash,
        documentNumberMasked: existing.documentNumberMasked,
        expiresAt: dto.expiresAt,
      });
    }
    const file = parseDriverLicenseFile(dto.fileDataUrl);
    if (!this.deps.licenseStorage) throw AppError.internal();

    const storageKey = await this.deps.licenseStorage.upload(dto.fileDataUrl, file.extension);
    return this.execute({
      userId: dto.userId,
      type: 'DRIVING_LICENSE',
      storageKey,
      documentHash: file.sha256,
      documentNumberMasked: `****${dto.dlNumber.slice(-4)}`,
      expiresAt: dto.expiresAt,
    });
  }

  async executeVehicleFile(dto: {
    userId: string;
    type: 'REGISTRATION_CERTIFICATE' | 'INSURANCE' | 'PERMIT';
    fileDataUrl: string;
    expiresAt: Date;
  }): Promise<DriverDocumentEntity> {
    const file = parseDriverLicenseFile(dto.fileDataUrl, 'Vehicle document');
    const driver = await this.deps.driverRepo.findByUserId(dto.userId);
    if (!driver) throw AppError.notFound('Driver profile not found.');
    const application = await this.deps.applicationRepo.findByDriverId(driver.id);
    if (!application || !['DRAFT', 'REAPPLIED'].includes(application.status)) {
      throw AppError.badRequest('Start a draft application before uploading vehicle documents.');
    }
    if (dto.expiresAt <= new Date()) throw AppError.badRequest('Document expiry must be in the future.');
    if (!this.deps.licenseStorage) throw AppError.internal();

    const storageKey = await this.deps.licenseStorage.upload(dto.fileDataUrl, file.extension);
    return this.execute({
      userId: dto.userId,
      type: dto.type,
      vehicleId: driver.currentVehicleId ?? null,
      storageKey,
      documentHash: file.sha256,
      expiresAt: dto.expiresAt,
    });
  }

  async executeIdentityFile(dto: { userId: string; fileDataUrl: string }): Promise<DriverDocumentEntity> {
    const file = parseDriverLicenseFile(dto.fileDataUrl, 'Government ID');
    const driver = await this.deps.driverRepo.findByUserId(dto.userId);
    if (!driver) throw AppError.notFound('Driver profile not found.');
    const application = await this.deps.applicationRepo.findByDriverId(driver.id);
    if (!application || !['DRAFT', 'REAPPLIED'].includes(application.status)) {
      throw AppError.badRequest('Start a draft application before uploading your ID.');
    }
    if (!this.deps.licenseStorage) throw AppError.internal();

    const storageKey = await this.deps.licenseStorage.upload(dto.fileDataUrl, file.extension);
    return this.execute({
      userId: dto.userId,
      type: 'GOVERNMENT_ID',
      storageKey,
      documentHash: file.sha256,
    });
  }

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
    const resolvedVehicleId = isVehicleScopedDocumentType(dto.type)
      ? dto.vehicleId !== undefined
        ? dto.vehicleId
        : (driver.currentVehicleId ?? existing?.vehicleId ?? null)
      : null;

    if (existing) {
      const updated: DriverDocumentEntity = {
        ...existing,
        vehicleId: resolvedVehicleId,
        storageKey: dto.storageKey,
        documentHash: dto.documentHash,
        documentNumberMasked: dto.documentNumberMasked ?? existing.documentNumberMasked,
        issuedAt: dto.issuedAt !== undefined ? dto.issuedAt : existing.issuedAt,
        expiresAt: dto.expiresAt !== undefined ? dto.expiresAt : existing.expiresAt,
        verificationStatus: 'PENDING',
        verifiedAt: null,
        lastExpiryReminderDays: null,
        updatedAt: now,
      };
      return this.deps.documentRepo.update(updated);
    }

    const newDoc: DriverDocumentEntity = {
      id: newUuid(),
      driverId: driver.id,
      applicationId: application.id,
      vehicleId: resolvedVehicleId,
      type: dto.type,
      storageKey: dto.storageKey,
      documentHash: dto.documentHash,
      documentNumberMasked: dto.documentNumberMasked ?? null,
      issuedAt: dto.issuedAt ?? null,
      expiresAt: dto.expiresAt ?? null,
      verificationStatus: 'PENDING',
      verifiedAt: null,
      lastExpiryReminderDays: null,
      createdAt: now,
      updatedAt: now,
    };

    return this.deps.documentRepo.create(newDoc);
  }
}
