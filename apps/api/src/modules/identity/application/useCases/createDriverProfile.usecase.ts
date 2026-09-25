import { newUuid } from '../../../../shared/ids.js';
import type { DriverEntity, DriverRepositoryPort } from '../../domain/index.js';

export interface CreateDriverProfileDeps {
  driverRepo: DriverRepositoryPort;
}

export class CreateDriverProfileUseCase {
  constructor(private readonly deps: CreateDriverProfileDeps) {}

  async execute(userId: string): Promise<DriverEntity> {
    const existing = await this.deps.driverRepo.findByUserId(userId);
    if (existing) {
      return existing;
    }

    const now = new Date();
    const newDriver: DriverEntity = {
      id: newUuid(),
      userId,
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
