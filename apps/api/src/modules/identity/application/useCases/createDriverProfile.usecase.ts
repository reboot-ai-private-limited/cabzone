import { newUuid } from '../../../../shared/ids.js';
import type { DriverEntity, DriverRepositoryPort } from '../../domain/index.js';
import type { DriverPhotoStoragePort } from '../../domain/driverPhoto.port.js';
import { AppError } from '../../../../shared/errors/AppError.js';

export interface CreateDriverProfileDeps {
  driverRepo: DriverRepositoryPort;
  photoStorage?: DriverPhotoStoragePort;
}

export interface CreateDriverProfileInput {
  userId: string;
  name?: string | null | undefined;
  profilePhotoDataUrl?: string | null | undefined;
  gender?: string | null | undefined;
  dateOfBirth?: string | null | undefined;
  address?: string | null | undefined;
  dlNumber?: string | null | undefined;
  dlExpiry?: string | null | undefined;
  emergencyContact?: string | null | undefined;
  alternatePhone?: string | null | undefined;
}

export class CreateDriverProfileUseCase {
  constructor(private readonly deps: CreateDriverProfileDeps) {}

  async execute(input: string | CreateDriverProfileInput): Promise<DriverEntity> {
    const data: CreateDriverProfileInput = typeof input === 'string' ? { userId: input } : input;
    const existing = await this.deps.driverRepo.findByUserId(data.userId);
    if (existing && existing.kycStatus === 'VERIFIED') {
      const dlNumberChanged =
        data.dlNumber !== undefined && data.dlNumber !== (existing.dlNumber ?? null);
      const dlExpiryChanged =
        data.dlExpiry !== undefined && data.dlExpiry !== (existing.dlExpiry ?? null);
      if (dlNumberChanged || dlExpiryChanged) {
        throw AppError.forbidden(
          'DL_LOCKED_AFTER_VERIFICATION: Submit a driving licence renewal to update licence details.',
        );
      }
    }

    let profilePhotoUrl = existing?.profilePhotoUrl ?? null;
    if (data.profilePhotoDataUrl === null) profilePhotoUrl = null;
    if (data.profilePhotoDataUrl) {
      if (!this.deps.photoStorage) throw AppError.internal();
      profilePhotoUrl = await this.deps.photoStorage.upload(data.profilePhotoDataUrl);
    }
    if (existing) {
      const updated: DriverEntity = {
        ...existing,
        name: data.name !== undefined ? data.name : existing.name,
        profilePhotoUrl,
        gender: data.gender !== undefined ? data.gender : existing.gender,
        dateOfBirth: data.dateOfBirth !== undefined ? data.dateOfBirth : existing.dateOfBirth,
        address: data.address !== undefined ? data.address : existing.address,
        dlNumber: data.dlNumber !== undefined ? data.dlNumber : existing.dlNumber,
        dlExpiry: data.dlExpiry !== undefined ? data.dlExpiry : existing.dlExpiry,
        emergencyContact:
          data.emergencyContact !== undefined ? data.emergencyContact : existing.emergencyContact,
        alternatePhone:
          data.alternatePhone !== undefined ? data.alternatePhone : existing.alternatePhone,
        updatedAt: new Date(),
      };
      return this.deps.driverRepo.update(updated);
    }

    const now = new Date();
    const newDriver: DriverEntity = {
      id: newUuid(),
      userId: data.userId,
      name: data.name ?? null,
      profilePhotoUrl,
      gender: data.gender ?? null,
      dateOfBirth: data.dateOfBirth ?? null,
      address: data.address ?? null,
      dlNumber: data.dlNumber ?? null,
      dlExpiry: data.dlExpiry ?? null,
      emergencyContact: data.emergencyContact ?? null,
      alternatePhone: data.alternatePhone ?? null,
      status: 'PENDING',
      kycStatus: 'PENDING',
      operationalStatus: 'OFFLINE',
      ratingAverage: null,
      ratingCount: 0,
      trustScore: null,
      currentVehicleId: null,
      walletId: newUuid(),
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    return this.deps.driverRepo.create(newDriver);
  }
}
