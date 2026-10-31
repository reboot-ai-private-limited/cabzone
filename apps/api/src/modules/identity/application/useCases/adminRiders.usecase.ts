import type {
  AdminRiderDetailDto,
  AdminRiderSummaryDto,
  AdminUpdateRiderProfileDto,
  ListRidersQueryDto,
  ListRidersResponseDto,
} from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import type {
  RiderEntity,
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
  onAccountSuspended?: ((userId: string) => Promise<void>) | undefined;
}

function toAdminEmergencyContact(rider: RiderEntity) {
  return rider.emergencyContact ? { name: rider.emergencyContact.name } : null;
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

    let tripCounts = new Map<
      string,
      {
        totalRides: number;
        completedRides: number;
        cancelledRides: number;
        noShowsCount?: number | undefined;
        disputesCount?: number | undefined;
      }
    >();
    if (this.deps.rideRepo && items.length > 0) {
      try {
        const riderIds = items.map((i) => i.rider.id);
        tripCounts = await this.deps.rideRepo.getRiderTripCountsBatch(riderIds);
      } catch {
        // Fallback gracefully if rides repository is not configured
      }
    }

    const riders: AdminRiderSummaryDto[] = items.map((item) => {
      const counts = tripCounts.get(item.rider.id) ?? {
        totalRides: 0,
        completedRides: 0,
        cancelledRides: 0,
      };
      const trust = calculateTrustScore({
        completedRides: counts.completedRides,
        cancelledRides: counts.cancelledRides,
        ratingAverage: item.rider.ratingAverage,
        ratingCount: item.rider.ratingCount,
        noShowsCount: counts.noShowsCount ?? 0,
        disputesCount: counts.disputesCount ?? 0,
      });

      return {
        id: item.rider.id,
        userId: item.rider.userId,
        status: item.status,
        name: item.rider.name,
        email: item.rider.email,
        preferredLanguage: item.rider.preferredLanguage,
        emergencyContact: toAdminEmergencyContact(item.rider),
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

    let stats: {
      totalRides: number;
      completedRides: number;
      cancelledRides: number;
      totalSpentPaise: number;
      noShowsCount?: number | undefined;
      disputesCount?: number | undefined;
    } = { totalRides: 0, completedRides: 0, cancelledRides: 0, totalSpentPaise: 0 };
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
      noShowsCount: stats.noShowsCount ?? 0,
      disputesCount: stats.disputesCount ?? 0,
    });

    return {
      id: rider.id,
      userId: rider.userId,
      status: user.status,
      name: rider.name,
      email: rider.email,
      preferredLanguage: rider.preferredLanguage,
      emergencyContact: toAdminEmergencyContact(rider),
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
      await this.deps.sessionRepo.revokeAllForUser(user.id);
      await this.deps.onAccountSuspended?.(user.id).catch(() => undefined);
    }

    let counts = { totalRides: 0, completedRides: 0, cancelledRides: 0 };
    if (this.deps.rideRepo) {
      try {
        const stats = await this.deps.rideRepo.getRiderStats(rider.id);
        counts = {
          totalRides: stats.totalRides,
          completedRides: stats.completedRides,
          cancelledRides: stats.cancelledRides,
        };
      } catch {
        // Fallback gracefully
      }
    }

    return {
      id: rider.id,
      userId: rider.userId,
      status: updatedUser.status,
      name: rider.name,
      email: rider.email,
      preferredLanguage: rider.preferredLanguage,
      emergencyContact: toAdminEmergencyContact(rider),
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

  async execute(riderId: string, data: AdminUpdateRiderProfileDto): Promise<AdminRiderDetailDto> {
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
      status: user.status,
      name: updatedRider.name,
      email: updatedRider.email,
      preferredLanguage: updatedRider.preferredLanguage,
      emergencyContact: toAdminEmergencyContact(updatedRider),
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
