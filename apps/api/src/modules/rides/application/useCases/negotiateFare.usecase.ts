import { calculateNegotiationBounds } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type {
  RideEntity,
  RideEventEntity,
  RideEventRepositoryPort,
  RideRepositoryPort,
} from '../../domain/index.js';
import {
  DRIVER_BUSY_STATUSES,
  type AcceptRideResult,
  type AcceptRideUseCase,
} from './acceptRide.usecase.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';

export const COUNTER_PROPOSED = 'FARE_COUNTER_PROPOSED';
export const COUNTER_ACCEPTED = 'FARE_COUNTER_ACCEPTED';
export const COUNTER_REJECTED = 'FARE_COUNTER_REJECTED';
export const FARE_PROPOSAL_RAISED = 'FARE_PROPOSAL_RAISED';

export interface FareCounter {
  driverId: string;
  proposedFarePaise: number;
  driverName?: string | null | undefined;
  vehicleLabel?: string | null | undefined;
  createdAt: Date;
}

export interface NegotiateFareDeps {
  rideRepo: RideRepositoryPort;
  rideEventRepo: RideEventRepositoryPort;
  unitOfWork: UnitOfWorkPort;
  acceptRide: AcceptRideUseCase;
  requireDriverEligibility: (driverId: string, ride: RideEntity) => Promise<string>;
}

/** Latest counter-offer that has not been answered yet. */
export function pendingCounters(events: RideEventEntity[]): FareCounter[] {
  const sorted = [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const pending = new Map<string, FareCounter>();
  let raisedVersion = 0;
  for (const e of sorted) {
    if (e.eventType === FARE_PROPOSAL_RAISED) {
      raisedVersion = Number(e.metadata?.['rideVersion'] ?? 0);
      pending.clear();
      continue;
    }
    if (
      e.eventType !== COUNTER_PROPOSED &&
      e.eventType !== COUNTER_ACCEPTED &&
      e.eventType !== COUNTER_REJECTED
    )
      continue;
    const metadata = e.metadata ?? {};
    const driverId = String(metadata['driverId'] ?? '');
    if (!driverId) continue;
    if (e.eventType === COUNTER_PROPOSED) {
      if (raisedVersion && Number(metadata['rideVersion'] ?? 0) < raisedVersion) continue;
      const proposedFarePaise = Number(metadata['proposedFarePaise']);
      if (!Number.isFinite(proposedFarePaise) || proposedFarePaise <= 0) continue;
      const driverName =
        typeof metadata['driverName'] === 'string' && metadata['driverName'].trim().length > 0
          ? metadata['driverName'].trim()
          : null;
      const vehicleLabel =
        typeof metadata['vehicleLabel'] === 'string' && metadata['vehicleLabel'].trim().length > 0
          ? metadata['vehicleLabel'].trim()
          : null;
      pending.set(driverId, {
        driverId,
        proposedFarePaise,
        driverName,
        vehicleLabel,
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

  async raise(input: {
    rideId: string;
    riderId: string;
    proposedFarePaise: number;
  }): Promise<RideEntity> {
    return this.deps.unitOfWork.run(async () => {
      const ride = await this.openRide(input.rideId);
      if (ride.bookerRiderId !== input.riderId) {
        throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
      }
      const snap = ride.pricingSnapshot;
      const { ceilingPaise } = calculateNegotiationBounds({
        suggestedFarePaise: ride.suggestedFarePaise,
        minimumFarePaise: snap.minimumFarePaise,
        floorPercent: snap.negotiationFloorPercent,
        ceilingPercent: snap.negotiationCeilingPercent,
      });
      if (
        input.proposedFarePaise <= (ride.proposedFarePaise ?? ride.suggestedFarePaise) ||
        input.proposedFarePaise > ceilingPaise
      ) {
        throw AppError.badRequest(
          'FARE_OUTSIDE_NEGOTIATION_LIMIT: Choose a higher fare within the allowed range.',
        );
      }
      const now = new Date();
      const updated = await this.deps.rideRepo.update(
        {
          ...ride,
          proposedFarePaise: input.proposedFarePaise,
          updatedAt: now,
          version: ride.version + 1,
        },
        ride.version,
      );
      if (!updated) throw AppError.conflict('RIDE_UNAVAILABLE: Ride changed, please retry.');
      await this.deps.rideEventRepo.save({
        id: newUuid(),
        rideId: ride.id,
        eventType: FARE_PROPOSAL_RAISED,
        actorType: 'RIDER',
        actorId: input.riderId,
        previousStatus: ride.status,
        newStatus: ride.status,
        metadata: { proposedFarePaise: input.proposedFarePaise, rideVersion: updated.version },
        createdAt: now,
      });
      return updated;
    });
  }

  /** A driver answers an offer with a different fare, within the same bounds the rider had. */
  async counter(input: {
    rideId: string;
    driverId: string;
    proposedFarePaise: number;
    driverName?: string | null | undefined;
    vehicleLabel?: string | null | undefined;
  }): Promise<{ ride: RideEntity; counter: FareCounter }> {
    const ride = await this.openRide(input.rideId);
    const busy = await this.deps.rideRepo.list({
      driverId: input.driverId,
      statuses: DRIVER_BUSY_STATUSES,
      limit: 1,
      offset: 0,
    });
    if (busy.some((existing) => existing.id !== ride.id)) {
      throw AppError.conflict(
        'DRIVER_BUSY: Complete and settle your current ride before proposing a counter-offer.',
      );
    }
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
    const metadata: Record<string, unknown> = {
      driverId: input.driverId,
      proposedFarePaise: input.proposedFarePaise,
      rideVersion: ride.version,
    };
    if (input.driverName) metadata['driverName'] = input.driverName;
    if (input.vehicleLabel) metadata['vehicleLabel'] = input.vehicleLabel;

    await this.deps.rideEventRepo.save({
      id: newUuid(),
      rideId: ride.id,
      eventType: COUNTER_PROPOSED,
      actorType: 'DRIVER',
      actorId: input.driverId,
      previousStatus: ride.status,
      newStatus: ride.status,
      metadata,
      createdAt,
    });
    return {
      ride,
      counter: {
        driverId: input.driverId,
        proposedFarePaise: input.proposedFarePaise,
        driverName: input.driverName ?? null,
        vehicleLabel: input.vehicleLabel ?? null,
        createdAt,
      },
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

    await this.deps.acceptRide.ensureDriverCanClaim(counter.driverId, ride);

    // AcceptRideUseCase opens its own unit of work, so this stays outside one (no nesting).
    const updated = await this.deps.rideRepo.update(
      {
        ...ride,
        proposedFarePaise: counter.proposedFarePaise,
        updatedAt: new Date(),
        version: ride.version + 1,
      },
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
