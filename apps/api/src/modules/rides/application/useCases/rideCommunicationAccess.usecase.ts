import { RIDE_COMMUNICATION_STATUSES, type AuthRole } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import type { RideRepositoryPort } from '../../domain/index.js';

export interface RideCommunicationAccessDeps {
  rideRepo: Pick<RideRepositoryPort, 'findById'>;
  resolveRiderId: (userId: string) => Promise<string | null>;
  resolveDriverId: (userId: string) => Promise<string | null>;
  isCommunicationAccountActive: (userId: string, role: 'RIDER' | 'DRIVER') => Promise<boolean>;
}

/** Read gate shared by chat and voice; writes must also serialize against ride closure. */
export class RideCommunicationAccessUseCase {
  constructor(private readonly deps: RideCommunicationAccessDeps) {}

  async execute(rideId: string, actor: { userId: string; role: AuthRole }) {
    if (actor.role !== 'RIDER' && actor.role !== 'DRIVER') {
      throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
    }
    if (!(await this.deps.isCommunicationAccountActive(actor.userId, actor.role))) {
      throw AppError.forbidden('COMMUNICATION_ACCOUNT_INACTIVE: Account is inactive.');
    }
    const ride = await this.deps.rideRepo.findById(rideId);
    const profileId = await (actor.role === 'RIDER'
      ? this.deps.resolveRiderId(actor.userId)
      : this.deps.resolveDriverId(actor.userId));
    if (!ride || !profileId || profileId !== (actor.role === 'RIDER' ? ride.bookerRiderId : ride.driverId)) {
      throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
    }
    if (!ride.driverId || !RIDE_COMMUNICATION_STATUSES.includes(ride.status)) {
      throw AppError.conflict('COMMUNICATION_CLOSED: Ride communication is unavailable.');
    }
    return { ride, participantRole: actor.role };
  }
}
