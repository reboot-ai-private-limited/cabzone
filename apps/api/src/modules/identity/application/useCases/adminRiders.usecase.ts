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
import type { TripStats } from '../../../rides/rides.public.js';
import { emptyTripStats } from '../../../rides/rides.public.js';
import type { TrustScoreService } from '../trustScore.service.js';

export interface AdminRiderDeps {
  riderRepo: RiderRepositoryPort;
  userRepo: UserRepositoryPort;
  sessionRepo: SessionRepositoryPort;
  /** One source of trust numbers for the list, the detail view and the stored score. */
  trustScore: TrustScoreService;
  onAccountSuspended?: ((userId: string) => Promise<void>) | undefined;
}

function toAdminEmergencyContact(rider: RiderEntity) {
  return rider.emergencyContact
    ? { name: rider.emergencyContact.name, phoneE164: rider.emergencyContact.phoneE164 }
    : null;
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

    const stats = await this.deps.trustScore.loadStats(
      'RIDER',
      items.map((i) => i.rider.id),
    );

    const riders: AdminRiderSummaryDto[] = items.map((item) => {
      const counts = stats.get(item.rider.id) ?? emptyTripStats();
      const trust = this.deps.trustScore.evaluate('RIDER', item.rider, counts).active;

      return {
        id: item.rider.id,
        userId: item.rider.userId,
        phoneE164: item.phoneE164,
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

async function loadRiderStats(deps: AdminRiderDeps, riderId: string): Promise<TripStats> {
  return (await deps.trustScore.loadStats('RIDER', [riderId])).get(riderId) ?? emptyTripStats();
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

    const stats = await loadRiderStats(this.deps, rider.id);
    const trust = this.deps.trustScore.evaluate('RIDER', rider, stats).active;

    return {
      id: rider.id,
      userId: rider.userId,
      phoneE164: user.phoneE164,
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

    const stats = await loadRiderStats(this.deps, rider.id);

    return {
      id: rider.id,
      userId: rider.userId,
      phoneE164: updatedUser.phoneE164,
      status: updatedUser.status,
      name: rider.name,
      email: rider.email,
      preferredLanguage: rider.preferredLanguage,
      emergencyContact: toAdminEmergencyContact(rider),
      ratingAverage: rider.ratingAverage,
      ratingCount: rider.ratingCount,
      totalRides: stats.totalRides,
      completedRides: stats.completedRides,
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

    const stats = await loadRiderStats(this.deps, rider.id);

    return {
      id: updatedRider.id,
      userId: updatedRider.userId,
      phoneE164: user.phoneE164,
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
