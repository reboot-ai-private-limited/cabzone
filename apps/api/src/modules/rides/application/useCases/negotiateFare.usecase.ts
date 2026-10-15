import { calculateNegotiationBounds } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type {
  RideEntity,
  RideEventEntity,
  RideEventRepositoryPort,
  RideRepositoryPort,
} from '../../domain/index.js';
import type { AcceptRideResult, AcceptRideUseCase } from './acceptRide.usecase.js';

export const COUNTER_PROPOSED = 'FARE_COUNTER_PROPOSED';
export const COUNTER_ACCEPTED = 'FARE_COUNTER_ACCEPTED';
export const COUNTER_REJECTED = 'FARE_COUNTER_REJECTED';

export interface FareCounter {
  driverId: string;
  proposedFarePaise: number;
  createdAt: Date;
}

export interface NegotiateFareDeps {
  rideRepo: RideRepositoryPort;
  rideEventRepo: RideEventRepositoryPort;
  acceptRide: AcceptRideUseCase;
  requireDriverEligibility: (driverId: string, ride: RideEntity) => Promise<string>;
}

/** Latest counter-offer that has not been answered yet. */
export function pendingCounters(events: RideEventEntity[]): FareCounter[] {
  const sorted = [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const pending = new Map<string, FareCounter>();
  for (const e of sorted) {
    if (e.eventType !== COUNTER_PROPOSED && e.eventType !== COUNTER_ACCEPTED && e.eventType !== COUNTER_REJECTED) continue;
    const metadata = e.metadata ?? {};
    const driverId = String(metadata['driverId'] ?? '');
    if (!driverId) continue;
    if (e.eventType === COUNTER_PROPOSED) {
      const proposedFarePaise = Number(metadata['proposedFarePaise']);
      if (!Number.isFinite(proposedFarePaise) || proposedFarePaise <= 0) continue;
      pending.set(driverId, {
        driverId,
        proposedFarePaise,
        createdAt: e.createdAt,
      });
    } else if (e.eventType === COUNTER_ACCEPTED || e.eventType === COUNTER_REJECTED) {
      pending.delete(driverId);
    }
  }
  return [...pending.values()];
}

export class NegotiateFareUseCase {
  constructor(private readonly deps: NegotiateFareDeps) {}

  private async openRide(rideId: string): Promise<RideEntity> {
    const ride = await this.deps.rideRepo.findById(rideId);
    if (!ride) throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
    if (ride.status !== 'OFFERING') {
      throw AppError.conflict(`RIDE_UNAVAILABLE: Ride is in ${ride.status} state.`);
    }
    if (ride.offeringExpiresAt && new Date() > ride.offeringExpiresAt) {
      throw AppError.conflict('OFFER_EXPIRED: The offer window for this ride has closed.');
    }
    return ride;
  }

  /** A driver answers an offer with a different fare, within the same bounds the rider had. */
  async counter(input: {
    rideId: string;
    driverId: string;
    proposedFarePaise: number;
  }): Promise<{ ride: RideEntity; counter: FareCounter }> {
    const ride = await this.openRide(input.rideId);
    await this.deps.requireDriverEligibility(input.driverId, ride);

    const snap = ride.pricingSnapshot;
    const { floorPaise, ceilingPaise } = calculateNegotiationBounds({
      suggestedFarePaise: ride.suggestedFarePaise,
      minimumFarePaise: snap.minimumFarePaise,
      floorPercent: snap.negotiationFloorPercent,
      ceilingPercent: snap.negotiationCeilingPercent,
    });
    if (input.proposedFarePaise < floorPaise || input.proposedFarePaise > ceilingPaise) {
      throw AppError.badRequest(
        `FARE_OUTSIDE_NEGOTIATION_LIMIT: Counter ${input.proposedFarePaise} is outside allowed bounds [${floorPaise}, ${ceilingPaise}].`,
      );
    }

    const createdAt = new Date();
    await this.deps.rideEventRepo.save({
      id: newUuid(),
      rideId: ride.id,
      eventType: COUNTER_PROPOSED,
      actorType: 'DRIVER',
      actorId: input.driverId,
      previousStatus: ride.status,
      newStatus: ride.status,
      metadata: { driverId: input.driverId, proposedFarePaise: input.proposedFarePaise },
      createdAt,
    });
    return {
      ride,
      counter: { driverId: input.driverId, proposedFarePaise: input.proposedFarePaise, createdAt },
    };
  }

  /** The rider takes or declines a driver's counter. Taking it assigns that driver at that fare. */
  async respond(input: {
    rideId: string;
    riderId: string;
    driverId: string;
    action: 'ACCEPTED' | 'REJECTED';
  }): Promise<{ ride: RideEntity; counter: FareCounter; accepted?: AcceptRideResult }> {
    const ride = await this.openRide(input.rideId);
    if (ride.bookerRiderId !== input.riderId) {
      throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
    }
    const events = await this.deps.rideEventRepo.findByRideId(ride.id);
    const counter = pendingCounters(events).find((c) => c.driverId === input.driverId);
    if (!counter) {
      throw AppError.conflict('NO_PENDING_COUNTER: This driver has no open counter-offer.');
    }

    const save = (eventType: string) =>
      this.deps.rideEventRepo.save({
        id: newUuid(),
        rideId: ride.id,
        eventType,
        actorType: 'RIDER',
        actorId: input.riderId,
        previousStatus: ride.status,
        newStatus: ride.status,
        metadata: { driverId: counter.driverId, proposedFarePaise: counter.proposedFarePaise },
        createdAt: new Date(),
      });

    if (input.action === 'REJECTED') {
      await save(COUNTER_REJECTED);
      return { ride, counter };
    }

    // AcceptRideUseCase opens its own unit of work, so this stays outside one (no nesting).
    const updated = await this.deps.rideRepo.update(
      { ...ride, proposedFarePaise: counter.proposedFarePaise, updatedAt: new Date(), version: ride.version + 1 },
      ride.version,
    );
    if (!updated) throw AppError.conflict('RIDE_UNAVAILABLE: Ride changed, please retry.');
    await save(COUNTER_ACCEPTED);
    const accepted = await this.deps.acceptRide.execute({
      rideId: ride.id,
      driverId: counter.driverId,
    });
    return { ride: accepted.ride, counter, accepted };
  }
}
