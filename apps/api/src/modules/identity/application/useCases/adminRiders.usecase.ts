import type {
  AdminRiderDetailDto,
  AdminRiderSummaryDto,
  ListRidersQueryDto,
  ListRidersResponseDto,
  UpdateRiderProfileDto,
} from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import type {
  RiderRepositoryPort,
  SessionRepositoryPort,
  UserRepositoryPort,
} from '../../domain/index.js';
import { calculateTrustScore } from '../../domain/trustScore.calculator.js';
import type { RideRepositoryPort } from '../../../rides/rides.public.js';

export interface AdminRiderDeps {
  riderRepo: RiderRepositoryPort;
  userRepo: UserRepositoryPort;
  sessionRepo: SessionRepositoryPort;
  rideRepo?: RideRepositoryPort | undefined;
}

export class ListRidersUseCase {
  constructor(private readonly deps: AdminRiderDeps) {}

  async execute(query: ListRidersQueryDto): Promise<ListRidersResponseDto> {
    const limit = Math.max(1, Math.min(query.limit ?? 20, 100));
    const offset = Math.max(0, query.offset ?? 0);

    const { items, total } = await this.deps.riderRepo.list({
      search: query.search,
      status: query.status,
      limit,
      offset,
    });

    let tripCounts = new Map<string, { totalRides: number; completedRides: number; cancelledRides: number }>();
    if (this.deps.rideRepo && items.length > 0) {
      try {
        const riderIds = items.map((i) => i.rider.id);
        tripCounts = await this.deps.rideRepo.getRiderTripCountsBatch(riderIds);
      } catch {
        // Fallback gracefully if rides repository is not configured
      }
    }

    const riders: AdminRiderSummaryDto[] = items.map((item) => {
      const counts = tripCounts.get(item.rider.id) ?? { totalRides: 0, completedRides: 0, cancelledRides: 0 };
      const cancelledRides = counts.cancelledRides;
      const trust = calculateTrustScore({
        completedRides: counts.completedRides,
        cancelledRides,
        ratingAverage: item.rider.ratingAverage,
        ratingCount: item.rider.ratingCount,
      });

      return {
        id: item.rider.id,
        userId: item.rider.userId,
        phoneE164: item.phoneE164,
        status: item.status,
        name: item.rider.name,
        email: item.rider.email,
        preferredLanguage: item.rider.preferredLanguage,
        emergencyContact: item.rider.emergencyContact
          ? {
              name: item.rider.emergencyContact.name,
              phoneE164: item.rider.emergencyContact.phoneE164,
            }
          : null,
        ratingAverage: item.rider.ratingAverage,
        ratingCount: item.rider.ratingCount,
        trustScore: trust.score,
        trustScoreBreakdown: trust,
        totalRides: counts.totalRides,
        completedRides: counts.completedRides,
        createdAt: item.rider.createdAt.toISOString(),
        updatedAt: item.rider.updatedAt.toISOString(),
      };
    });

    return {
      riders,
      total,
      limit,
      offset,
    };
  }
}

export class GetRiderDetailUseCase {
  constructor(private readonly deps: AdminRiderDeps) {}

  async execute(riderId: string): Promise<AdminRiderDetailDto> {
    const rider = await this.deps.riderRepo.findById(riderId);
    if (!rider) {
      throw AppError.notFound('RIDER_NOT_FOUND: Customer profile not found.');
    }

    const user = await this.deps.userRepo.findById(rider.userId);
    if (!user) {
      throw AppError.notFound('USER_NOT_FOUND: Linked user account not found.');
    }

    let stats = { totalRides: 0, completedRides: 0, cancelledRides: 0, totalSpentPaise: 0 };
    if (this.deps.rideRepo) {
      try {
        stats = await this.deps.rideRepo.getRiderStats(rider.id);
      } catch {
        // Fallback gracefully
      }
    }

    const trust = calculateTrustScore({
      completedRides: stats.completedRides,
      cancelledRides: stats.cancelledRides,
      ratingAverage: rider.ratingAverage,
      ratingCount: rider.ratingCount,
    });

    return {
      id: rider.id,
      userId: rider.userId,
      phoneE164: user.phoneE164,
      status: user.status,
      name: rider.name,
      email: rider.email,
      preferredLanguage: rider.preferredLanguage,
      emergencyContact: rider.emergencyContact
        ? {
            name: rider.emergencyContact.name,
            phoneE164: rider.emergencyContact.phoneE164,
          }
        : null,
      ratingAverage: rider.ratingAverage,
      ratingCount: rider.ratingCount,
      trustScore: trust.score,
      trustScoreBreakdown: trust,
      totalRides: stats.totalRides,
      completedRides: stats.completedRides,
      cancelledRides: stats.cancelledRides,
      totalSpentPaise: stats.totalSpentPaise,
      createdAt: rider.createdAt.toISOString(),
      updatedAt: rider.updatedAt.toISOString(),
    };
  }
}

export class UpdateRiderStatusUseCase {
  constructor(private readonly deps: AdminRiderDeps) {}

  async execute(
    riderId: string,
    status: 'ACTIVE' | 'SUSPENDED',
  ): Promise<AdminRiderSummaryDto> {
    const rider = await this.deps.riderRepo.findById(riderId);
    if (!rider) {
      throw AppError.notFound('RIDER_NOT_FOUND: Customer profile not found.');
    }

    const user = await this.deps.userRepo.findById(rider.userId);
    if (!user) {
      throw AppError.notFound('USER_NOT_FOUND: Linked user account not found.');
    }

    const updatedUser = await this.deps.userRepo.update({
      ...user,
      status,
      version: user.version + 1,
      updatedAt: new Date(),
    });

    if (status === 'SUSPENDED') {
      // Security enforcement: Revoke all existing sessions immediately
      await this.deps.sessionRepo.revokeAllForUser(user.id);
    }

    let counts = { totalRides: 0, completedRides: 0, cancelledRides: 0 };
    if (this.deps.rideRepo) {
      try {
        const stats = await this.deps.rideRepo.getRiderStats(rider.id);
        counts = { totalRides: stats.totalRides, completedRides: stats.completedRides, cancelledRides: stats.cancelledRides };
      } catch {
        // Fallback gracefully
      }
    }

    return {
      id: rider.id,
      userId: rider.userId,
      phoneE164: updatedUser.phoneE164,
      status: updatedUser.status,
      name: rider.name,
      email: rider.email,
      preferredLanguage: rider.preferredLanguage,
      emergencyContact: rider.emergencyContact
        ? {
            name: rider.emergencyContact.name,
            phoneE164: rider.emergencyContact.phoneE164,
          }
        : null,
      ratingAverage: rider.ratingAverage,
      ratingCount: rider.ratingCount,
      totalRides: counts.totalRides,
      completedRides: counts.completedRides,
      createdAt: rider.createdAt.toISOString(),
      updatedAt: rider.updatedAt.toISOString(),
    };
  }
}

export class UpdateRiderProfileUseCase {
  constructor(private readonly deps: AdminRiderDeps) {}

  async execute(riderId: string, data: UpdateRiderProfileDto): Promise<AdminRiderDetailDto> {
    const rider = await this.deps.riderRepo.findById(riderId);
    if (!rider) {
      throw AppError.notFound('RIDER_NOT_FOUND: Customer profile not found.');
    }

    const user = await this.deps.userRepo.findById(rider.userId);
    if (!user) {
      throw AppError.notFound('USER_NOT_FOUND: Linked user account not found.');
    }

    const updatedRider = await this.deps.riderRepo.update({
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

    let stats = { totalRides: 0, completedRides: 0, cancelledRides: 0, totalSpentPaise: 0 };
    if (this.deps.rideRepo) {
      try {
        stats = await this.deps.rideRepo.getRiderStats(rider.id);
      } catch {
        // Fallback
      }
    }

    return {
      id: updatedRider.id,
      userId: updatedRider.userId,
      phoneE164: user.phoneE164,
      status: user.status,
      name: updatedRider.name,
      email: updatedRider.email,
      preferredLanguage: updatedRider.preferredLanguage,
      emergencyContact: updatedRider.emergencyContact
        ? {
            name: updatedRider.emergencyContact.name,
            phoneE164: updatedRider.emergencyContact.phoneE164,
          }
        : null,
      ratingAverage: updatedRider.ratingAverage,
      ratingCount: updatedRider.ratingCount,
      totalRides: stats.totalRides,
      completedRides: stats.completedRides,
      cancelledRides: stats.cancelledRides,
      totalSpentPaise: stats.totalSpentPaise,
      createdAt: updatedRider.createdAt.toISOString(),
      updatedAt: updatedRider.updatedAt.toISOString(),
    };
  }
}
