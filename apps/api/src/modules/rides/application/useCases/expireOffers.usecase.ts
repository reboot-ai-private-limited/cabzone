import { newUuid } from '../../../../shared/ids.js';
import type {
  RideEntity,
  RideEventRepositoryPort,
  RideNotifierPort,
  RideRepositoryPort,
} from '../../domain/index.js';

export interface ExpireOffersDeps {
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
      // Re-read guard: a driver may have claimed the ride since the scan.
      const current = await this.deps.rideRepo.findById(ride.id);
      if (!current || current.status !== 'OFFERING') continue;

      const saved = await this.deps.rideRepo.save({
        ...current,
        status: 'EXPIRED',
        cancellationReason: 'TIMEOUT_EXPIRED',
        updatedAt: now,
        version: current.version + 1,
      });
      await this.deps.rideEventRepo?.save({
        id: newUuid(),
        rideId: saved.id,
        eventType: 'OFFER_EXPIRED',
        actorType: 'SYSTEM',
        actorId: null,
        previousStatus: 'OFFERING',
        newStatus: 'EXPIRED',
        metadata: {},
        createdAt: now,
      });
      await this.deps.notifier?.rideUpdated(saved, 'ride.offer.expired');
      expired.push(saved);
    }
    return expired;
  }
}
