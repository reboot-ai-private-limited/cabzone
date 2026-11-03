import { ACTIVE_RIDE_STATUSES, RIDE_COMMUNICATION_STATUSES } from '@cabzone/contracts';
import type {
  RideCountFilter,
  RideEntity,
  RideListFilter,
  RideRepositoryPort,
  RiderTripCountsSummary,
} from '../../domain/index.js';
import { RideModel, type RideDocument } from './ride.model.js';
import { AppError } from '../../../../shared/errors/AppError.js';

export class MongoRideRepository implements RideRepositoryPort {
  async ensureReady(): Promise<void> {
    await RideModel.init();
  }

  async allocateChatSequence(rideId: string, expectedDriverId: string): Promise<number | null> {
    const doc = await RideModel.findOneAndUpdate(
      {
        _id: rideId,
        driver_id: expectedDriverId,
        status: { $in: [...RIDE_COMMUNICATION_STATUSES] },
      },
      { $inc: { chat_sequence: 1 } },
      { new: true },
    )
      .lean<RideDocument | null>()
      .exec();
    return doc?.chat_sequence ?? null;
  }

  async create(ride: RideEntity): Promise<RideEntity> {
    const [doc] = await RideModel.create([this.toPersistence(ride)]);
    return this.toEntity(doc!.toObject());
  }

  private buildQuery(filter: RideCountFilter): Record<string, unknown> {
    const query: Record<string, unknown> = {};
    if (filter.riderId !== undefined) {
      query['$or'] = [
        { booker_rider_id: filter.riderId },
        { 'passenger.rider_id': filter.riderId },
      ];
    }
    if (filter.driverId !== undefined) query.driver_id = filter.driverId;
    if (filter.statuses !== undefined) query.status = { $in: filter.statuses };
    if (filter.vehicleCategory !== undefined) query.vehicle_category = filter.vehicleCategory;
    if (filter.cityZoneIds !== undefined) {
      query['zone_snapshot.city_zone_id'] = { $in: filter.cityZoneIds };
    }
    if (filter.offeringExpiresAfter !== undefined) {
      query.offering_expires_at = { $gt: filter.offeringExpiresAfter };
    }
    return query;
  }

  async update(ride: RideEntity, expectedVersion: number): Promise<RideEntity | null> {
    const doc = await RideModel.findOneAndUpdate(
      { _id: ride.id, version: expectedVersion },
      this.toPersistence(ride),
      { new: true, runValidators: true },
    )
      .lean<RideDocument | null>()
      .exec();
    return doc ? this.toEntity(doc) : null;
  }

  async save(ride: RideEntity): Promise<RideEntity> {
    const doc = await RideModel.findByIdAndUpdate(ride.id, this.toPersistence(ride), {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    })
      .lean<RideDocument>()
      .exec();

    return this.toEntity(doc);
  }

  async findById(id: string): Promise<RideEntity | null> {
    const doc = await RideModel.findById(id).lean<RideDocument | null>().exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findActiveByBookerRiderId(bookerRiderId: string): Promise<RideEntity | null> {
    const doc = await RideModel.findOne({
      booker_rider_id: bookerRiderId,
      status: { $in: [...ACTIVE_RIDE_STATUSES] },
    })
      .lean<RideDocument | null>()
      .exec();
    return doc ? this.toEntity(doc) : null;
  }

  async findByBookerIdempotencyKey(
    bookerRiderId: string,
    idempotencyKey: string,
  ): Promise<RideEntity | null> {
    const doc = await RideModel.findOne({
      booker_rider_id: bookerRiderId,
      idempotency_key: idempotencyKey,
    })
      .lean<RideDocument | null>()
      .exec();
    return doc ? this.toEntity(doc) : null;
  }

  async list(filter: RideListFilter): Promise<RideEntity[]> {
    const query = this.buildQuery(filter);
    const docs = await RideModel.find(query)
      .sort({ created_at: -1 })
      .skip(filter.offset)
      .limit(filter.limit)
      .lean<RideDocument[]>()
      .exec();
    return docs.map((d) => this.toEntity(d));
  }

  async count(filter: RideCountFilter): Promise<number> {
    return RideModel.countDocuments(this.buildQuery(filter)).exec();
  }

  async listDriverRidesInWindow(driverId: string, since: Date | null): Promise<RideEntity[]> {
    // ponytail: per-driver document scan; add daily driver_earnings_rollups if lifetime rides/driver > 50k
    const query: Record<string, unknown> = { driver_id: driverId };
    if (since) {
      query['$or'] = [
        { settled_at: { $gte: since } },
        { completed_at: { $gte: since } },
        { cancelled_at: { $gte: since } },
        { updated_at: { $gte: since } },
        { created_at: { $gte: since } },
      ];
    }
    const docs = await RideModel.find(query).sort({ created_at: -1 }).lean<RideDocument[]>().exec();
    return docs.map((d) => this.toEntity(d));
  }

  async findExpiredOfferings(now: Date, limit: number): Promise<RideEntity[]> {
    const docs = await RideModel.find({ status: 'OFFERING', offering_expires_at: { $lt: now } })
      .sort({ offering_expires_at: 1 })
      .limit(limit)
      .lean<RideDocument[]>()
      .exec();
    return docs.map((d) => this.toEntity(d));
  }

  async atomicClaimRide(opts: {
    rideId: string;
    driverId: string;
    vehicleId?: string | undefined;
    agreedFarePaise: number;
    expectedVersion?: number;
    pickupOtpHash: string;
    pickupOtpExpiresAt: Date;
    assignedAt?: Date;
  }): Promise<RideEntity | null> {
    const assignedAt = opts.assignedAt ?? new Date();

    await RideModel.init();
    const doc = await RideModel.findOneAndUpdate(
      {
        _id: opts.rideId,
        ...(opts.expectedVersion === undefined ? {} : { version: opts.expectedVersion }),
        status: { $in: ['REQUESTED', 'OFFERING'] },
        driver_id: null,
        $or: [{ offering_expires_at: null }, { offering_expires_at: { $gt: assignedAt } }],
      },
      {
        $set: {
          driver_id: opts.driverId,
          vehicle_id: opts.vehicleId ?? null,
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
      .exec()
      .catch((error: unknown) => {
        if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
          throw AppError.conflict('DRIVER_BUSY: Driver already has an active ride.');
        }
        throw error;
      });

    return doc ? this.toEntity(doc) : null;
  }

  async countDailyRiderUnassignedCancellations(riderId: string, sinceDate: Date): Promise<number> {
    return RideModel.countDocuments({
      $or: [{ booker_rider_id: riderId }, { 'passenger.rider_id': riderId }],
      status: 'CANCELLED',
      driver_id: null,
      cancelled_at: { $gte: sinceDate },
    }).exec();
  }

  async getRiderStats(riderId: string): Promise<{
    totalRides: number;
    completedRides: number;
    cancelledRides: number;
    totalSpentPaise: number;
    noShowsCount: number;
    disputesCount: number;
  }> {
    const results = await RideModel.aggregate([
      {
        $match: {
          $or: [{ booker_rider_id: riderId }, { 'passenger.rider_id': riderId }],
        },
      },
      {
        $group: {
          _id: null,
          totalRides: { $sum: 1 },
          completedRides: {
            $sum: {
              $cond: [
                {
                  $in: [
                    '$status',
                    [
                      'TRIP_COMPLETED',
                      'PAYMENT_PENDING',
                      'PAYMENT_CASH_CLAIMED',
                      'PAYMENT_UNPAID',
                      'PAYMENT_DISPUTED',
                      'SETTLED',
                      'PAYMENT_CONFIRMED',
                    ],
                  ],
                },
                1,
                0,
              ],
            },
          },
          cancelledRides: {
            $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] },
          },
          noShowsCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'CANCELLED'] },
                    { $eq: ['$cancellation_reason', 'RIDER_NO_SHOW'] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          disputesCount: {
            $sum: { $cond: [{ $eq: ['$status', 'PAYMENT_DISPUTED'] }, 1, 0] },
          },
          totalSpentPaise: {
            $sum: {
              $cond: [
                {
                  $in: [
                    '$status',
                    [
                      'TRIP_COMPLETED',
                      'PAYMENT_PENDING',
                      'PAYMENT_CASH_CLAIMED',
                      'PAYMENT_UNPAID',
                      'PAYMENT_DISPUTED',
                      'SETTLED',
                      'PAYMENT_CONFIRMED',
                    ],
                  ],
                },
                { $ifNull: ['$agreed_fare_paise', '$suggested_fare_paise'] },
                0,
              ],
            },
          },
        },
      },
    ]).exec();

    if (!results || results.length === 0) {
      return {
        totalRides: 0,
        completedRides: 0,
        cancelledRides: 0,
        totalSpentPaise: 0,
        noShowsCount: 0,
        disputesCount: 0,
      };
    }
    const r = results[0];
    return {
      totalRides: r.totalRides ?? 0,
      completedRides: r.completedRides ?? 0,
      cancelledRides: r.cancelledRides ?? 0,
      totalSpentPaise: r.totalSpentPaise ?? 0,
      noShowsCount: r.noShowsCount ?? 0,
      disputesCount: r.disputesCount ?? 0,
    };
  }

  async getRiderTripCountsBatch(riderIds: string[]): Promise<Map<string, RiderTripCountsSummary>> {
    const map = new Map<string, RiderTripCountsSummary>();
    if (riderIds.length === 0) return map;

    const results = await RideModel.aggregate([
      {
        $match: {
          $or: [
            { booker_rider_id: { $in: riderIds } },
            { 'passenger.rider_id': { $in: riderIds } },
          ],
        },
      },
      {
        $group: {
          _id: '$booker_rider_id',
          cancelledRides: { $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] } },
          noShowsCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'CANCELLED'] },
                    { $eq: ['$cancellation_reason', 'RIDER_NO_SHOW'] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          disputesCount: {
            $sum: { $cond: [{ $eq: ['$status', 'PAYMENT_DISPUTED'] }, 1, 0] },
          },
          totalRides: { $sum: 1 },
          completedRides: {
            $sum: {
              $cond: [
                {
                  $in: [
                    '$status',
                    [
                      'TRIP_COMPLETED',
                      'PAYMENT_PENDING',
                      'PAYMENT_CASH_CLAIMED',
                      'PAYMENT_UNPAID',
                      'PAYMENT_DISPUTED',
                      'SETTLED',
                      'PAYMENT_CONFIRMED',
                    ],
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]).exec();

    for (const r of results) {
      map.set(r._id, {
        totalRides: r.totalRides ?? 0,
        completedRides: r.completedRides ?? 0,
        cancelledRides: r.cancelledRides ?? 0,
        noShowsCount: r.noShowsCount ?? 0,
        disputesCount: r.disputesCount ?? 0,
      });
    }
    return map;
  }

  private toPersistence(ride: RideEntity): Record<string, unknown> {
    return {
      _id: ride.id,
      booker_rider_id: ride.bookerRiderId,
      idempotency_key: ride.idempotencyKey ?? null,
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
      stops: (ride.stops ?? []).map((s) => ({ lat: s.lat, lng: s.lng, address: s.address })),
      route_snapshot: ride.routeSnapshot,
      toll_snapshot: ride.tollSnapshot ?? null,
      extension_proposal: ride.extensionProposal ?? null,
      zone_snapshot: ride.zoneSnapshot,
      pricing_snapshot: ride.pricingSnapshot,
      suggested_fare_paise: ride.suggestedFarePaise,
      proposed_fare_paise: ride.proposedFarePaise,
      agreed_fare_paise: ride.agreedFarePaise,
      arrears_paise: ride.arrearsPaise ?? 0,
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
      idempotencyKey: doc.idempotency_key ?? null,
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
      stops: (doc.stops ?? []).map((s) => ({ lat: s.lat, lng: s.lng, address: s.address ?? null })),
      routeSnapshot: doc.route_snapshot,
      tollSnapshot: doc.toll_snapshot ?? null,
      extensionProposal: doc.extension_proposal ?? null,
      zoneSnapshot: doc.zone_snapshot,
      pricingSnapshot: doc.pricing_snapshot,
      suggestedFarePaise: doc.suggested_fare_paise,
      proposedFarePaise: doc.proposed_fare_paise,
      agreedFarePaise: doc.agreed_fare_paise,
      arrearsPaise: doc.arrears_paise ?? 0,
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
