import { newUuid } from '../../../../shared/ids.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import type {
  RideEntity,
  RideEventRepositoryPort,
  RideNotifierPort,
  RideRepositoryPort,
} from '../../domain/index.js';

export interface ExpireOffersDeps {
  unitOfWork: UnitOfWorkPort;
  rideRepo: RideRepositoryPort;
  rideEventRepo?: RideEventRepositoryPort | undefined;
  notifier?: RideNotifierPort | undefined;
  batchSize?: number | undefined;
}

/** Moves OFFERING rides whose offer window has closed to EXPIRED (decision D-031). */
export class ExpireOffersUseCase {
  constructor(private readonly deps: ExpireOffersDeps) {}

  async execute(now: Date = new Date()): Promise<RideEntity[]> {
    const stale = await this.deps.rideRepo.findExpiredOfferings(now, this.deps.batchSize ?? 100);
    const expired: RideEntity[] = [];

    for (const ride of stale) {
      const saved = await this.deps.unitOfWork.run(async () => {
        const current = await this.deps.rideRepo.findById(ride.id);
        if (
          !current ||
          current.status !== 'OFFERING' ||
          !current.offeringExpiresAt ||
          current.offeringExpiresAt >= now
        ) {
          return null;
        }

        const updated = await this.deps.rideRepo.update(
          {
            ...current,
            status: 'EXPIRED',
            cancellationReason: 'TIMEOUT_EXPIRED',
            updatedAt: now,
            version: current.version + 1,
          },
          current.version,
        );
        if (!updated) return null;

        await this.deps.rideEventRepo?.save({
          id: newUuid(),
          rideId: updated.id,
          eventType: 'OFFER_EXPIRED',
          actorType: 'SYSTEM',
          actorId: null,
          previousStatus: 'OFFERING',
          newStatus: 'EXPIRED',
          metadata: {},
          createdAt: now,
        });
        return updated;
      });
      if (!saved) continue;
      await this.deps.notifier?.rideUpdated(saved, 'ride.offer.expired');
      expired.push(saved);
    }
    return expired;
  }
}
