import type { RiderDto, UpdateRiderProfileDto } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import type { RiderRepositoryPort, UserRepositoryPort } from '../../domain/index.js';

export interface RiderProfileDeps {
  riderRepo: RiderRepositoryPort;
  userRepo: UserRepositoryPort;
}

export class GetRiderProfileUseCase {
  constructor(private readonly deps: RiderProfileDeps) {}

  async execute(userId: string): Promise<RiderDto> {
    const rider = await this.deps.riderRepo.findByUserId(userId);
    if (!rider) {
      throw AppError.notFound('RIDER_NOT_FOUND: No rider profile associated with this user.');
    }

    return {
      id: rider.id,
      userId: rider.userId,
      name: rider.name,
      email: rider.email,
      emergencyContact: rider.emergencyContact
        ? {
            name: rider.emergencyContact.name,
            phoneE164: rider.emergencyContact.phoneE164,
          }
        : null,
      preferredLanguage: rider.preferredLanguage,
      ratingAverage: rider.ratingAverage,
      ratingCount: rider.ratingCount,
      createdAt: rider.createdAt.toISOString(),
      updatedAt: rider.updatedAt.toISOString(),
    };
  }
}

export class UpdateSelfRiderProfileUseCase {
  constructor(private readonly deps: RiderProfileDeps) {}

  async execute(userId: string, data: UpdateRiderProfileDto): Promise<RiderDto> {
    const rider = await this.deps.riderRepo.findByUserId(userId);
    if (!rider) {
      throw AppError.notFound('RIDER_NOT_FOUND: No rider profile associated with this user.');
    }

    const updated = await this.deps.riderRepo.update({
      ...rider,
      name: data.name !== undefined ? data.name : rider.name,
      email: data.email !== undefined ? data.email : rider.email,
      preferredLanguage:
        data.preferredLanguage !== undefined ? data.preferredLanguage : rider.preferredLanguage,
      emergencyContact:
        data.emergencyContact !== undefined
          ? data.emergencyContact
            ? {
                name: data.emergencyContact.name,
                phoneE164: data.emergencyContact.phoneE164,
              }
            : null
          : rider.emergencyContact,
      updatedAt: new Date(),
    });

    return {
      id: updated.id,
      userId: updated.userId,
      name: updated.name,
      email: updated.email,
      emergencyContact: updated.emergencyContact
        ? {
            name: updated.emergencyContact.name,
            phoneE164: updated.emergencyContact.phoneE164,
          }
        : null,
      preferredLanguage: updated.preferredLanguage,
      ratingAverage: updated.ratingAverage,
      ratingCount: updated.ratingCount,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
