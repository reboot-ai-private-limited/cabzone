import type { RideEntity, RideListFilter, RideRepositoryPort } from '../../domain/index.js';
import { RideModel, type RideDocument } from './ride.model.js';

export class MongoRideRepository implements RideRepositoryPort {
  async save(ride: RideEntity): Promise<RideEntity> {
    const doc = await RideModel.findByIdAndUpdate(
      ride.id,
      this.toPersistence(ride),
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
      .lean<RideDocument>()
      .exec();

    return this.toEntity(doc);
  }

  async findById(id: string): Promise<RideEntity | null> {
    const doc = await RideModel.findById(id).lean<RideDocument | null>().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async list(filter: RideListFilter): Promise<RideEntity[]> {
    const query: Record<string, unknown> = {};
    if (filter.riderId !== undefined) {
      query['$or'] = [{ booker_rider_id: filter.riderId }, { 'passenger.rider_id': filter.riderId }];
    }
    if (filter.driverId !== undefined) query.driver_id = filter.driverId;
    if (filter.statuses !== undefined) query.status = { '$in': filter.statuses };
    if (filter.vehicleCategory !== undefined) query.vehicle_category = filter.vehicleCategory;
    if (filter.offeringExpiresAfter !== undefined) {
      query.offering_expires_at = { '$gt': filter.offeringExpiresAfter };
    }

    const docs = await RideModel.find(query)
      .sort({ created_at: -1 })
      .skip(filter.offset)
      .limit(filter.limit)
      .lean<RideDocument[]>()
      .exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findExpiredOfferings(now: Date, limit: number): Promise<RideEntity[]> {
    const docs = await RideModel.find({ status: 'OFFERING', offering_expires_at: { '$lt': now } })
      .sort({ offering_expires_at: 1 })
      .limit(limit)
      .lean<RideDocument[]>()
      .exec();
    return docs.map((d) => this.toEntity(d));
  }

  async atomicClaimRide(opts: {
    rideId: string;
    driverId: string;
    agreedFarePaise: number;
    pickupOtpHash: string;
    pickupOtpExpiresAt: Date;
    assignedAt?: Date;
  }): Promise<RideEntity | null> {
    const assignedAt = opts.assignedAt ?? new Date();

    const doc = await RideModel.findOneAndUpdate(
      {
        _id: opts.rideId,
        status: { $in: ['REQUESTED', 'OFFERING'] },
        driver_id: null,
      },
      {
        $set: {
          driver_id: opts.driverId,
          status: 'DRIVER_ASSIGNED',
          agreed_fare_paise: opts.agreedFarePaise,
          'passenger.pickup_otp_hash': opts.pickupOtpHash,
          'passenger.pickup_otp_expires_at': opts.pickupOtpExpiresAt,
          'passenger.otp_attempts': 0,
          'passenger.max_otp_attempts': 3,
          accepted_at: assignedAt,
        },
        $inc: {
          version: 1,
        },
      },
      {
        new: true,
      },
    )
      .lean<RideDocument | null>()
      .exec();

    return doc ? this.toEntity(doc) : null;
  }

  async countDailyRiderUnassignedCancellations(
    riderId: string,
    sinceDate: Date,
  ): Promise<number> {
    return RideModel.countDocuments({
      $or: [
        { booker_rider_id: riderId },
        { 'passenger.rider_id': riderId },
      ],
      status: 'CANCELLED',
      driver_id: null,
      cancelled_at: { $gte: sinceDate },
    }).exec();
  }

  private toPersistence(ride: RideEntity): Record<string, unknown> {
    return {
      _id: ride.id,
      booker_rider_id: ride.bookerRiderId,
      passenger: {
        rider_id: ride.passenger.riderId,
        name: ride.passenger.name,
        phone_e164: ride.passenger.phoneE164,
        pickup_otp_hash: ride.passenger.pickupOtpHash,
        pickup_otp_expires_at: ride.passenger.pickupOtpExpiresAt ?? null,
        otp_attempts: ride.passenger.otpAttempts ?? 0,
        max_otp_attempts: ride.passenger.maxOtpAttempts ?? 3,
      },
      driver_id: ride.driverId,
      vehicle_id: ride.vehicleId,
      vehicle_category: ride.vehicleCategory,
      pickup: {
        lat: ride.pickup.lat,
        lng: ride.pickup.lng,
        address: ride.pickup.address,
      },
      drop: {
        lat: ride.drop.lat,
        lng: ride.drop.lng,
        address: ride.drop.address,
      },
      route_snapshot: ride.routeSnapshot,
      zone_snapshot: ride.zoneSnapshot,
      pricing_snapshot: ride.pricingSnapshot,
      suggested_fare_paise: ride.suggestedFarePaise,
      proposed_fare_paise: ride.proposedFarePaise,
      agreed_fare_paise: ride.agreedFarePaise,
      status: ride.status,
      cancellation_reason: ride.cancellationReason,
      offering_expires_at: ride.offeringExpiresAt,
      accepted_at: ride.acceptedAt,
      arrived_at: ride.arrivedAt,
      started_at: ride.startedAt,
      completed_at: ride.completedAt,
      settled_at: ride.settledAt,
      cancelled_at: ride.cancelledAt,
      version: ride.version,
    };
  }

  private toEntity(doc: RideDocument): RideEntity {
    return {
      id: doc._id,
      bookerRiderId: doc.booker_rider_id,
      passenger: {
        riderId: doc.passenger.rider_id,
        name: doc.passenger.name,
        phoneE164: doc.passenger.phone_e164,
        pickupOtpHash: doc.passenger.pickup_otp_hash,
        pickupOtpExpiresAt: doc.passenger.pickup_otp_expires_at ?? null,
        otpAttempts: doc.passenger.otp_attempts ?? 0,
        maxOtpAttempts: doc.passenger.max_otp_attempts ?? 3,
      },
      driverId: doc.driver_id,
      vehicleId: doc.vehicle_id,
      vehicleCategory: doc.vehicle_category,
      pickup: {
        lat: doc.pickup.lat,
        lng: doc.pickup.lng,
        address: doc.pickup.address,
      },
      drop: {
        lat: doc.drop.lat,
        lng: doc.drop.lng,
        address: doc.drop.address,
      },
      routeSnapshot: doc.route_snapshot,
      zoneSnapshot: doc.zone_snapshot,
      pricingSnapshot: doc.pricing_snapshot,
      suggestedFarePaise: doc.suggested_fare_paise,
      proposedFarePaise: doc.proposed_fare_paise,
      agreedFarePaise: doc.agreed_fare_paise,
      status: doc.status,
      cancellationReason: doc.cancellation_reason,
      offeringExpiresAt: doc.offering_expires_at,
      acceptedAt: doc.accepted_at,
      arrivedAt: doc.arrived_at,
      startedAt: doc.started_at,
      completedAt: doc.completed_at,
      settledAt: doc.settled_at,
      cancelledAt: doc.cancelled_at,
      version: doc.version,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }
}
