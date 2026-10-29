import type { Request, RequestHandler, Response } from 'express';
import type { RideAssignedDriverDto, WalletTransactionDto } from '@cabzone/contracts';
import { AppError } from '../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import type { WalletRepositoryPort } from '../../ledger/ledger.public.js';
import type { AcceptRideUseCase } from '../application/useCases/acceptRide.usecase.js';
import type { CancelRideUseCase } from '../application/useCases/cancelRide.usecase.js';
import type { CompleteRideUseCase } from '../application/useCases/completeRide.usecase.js';
import type { CreateRideUseCase } from '../application/useCases/createRide.usecase.js';
import type { DriverArrivedUseCase } from '../application/useCases/driverArrived.usecase.js';
import type { DriverEarningsUseCase } from '../application/useCases/driverEarnings.usecase.js';
import type { DriverEnRouteUseCase } from '../application/useCases/driverEnRoute.usecase.js';
import type { StartRideUseCase } from '../application/useCases/startRide.usecase.js';
import type { NegotiateFareUseCase } from '../application/useCases/negotiateFare.usecase.js';
import type { RideRatingsUseCase } from '../application/useCases/rideRatings.usecase.js';
import type {
  RideEntity,
  RideEventEntity,
  RideEventRepositoryPort,
  RideRepositoryPort,
} from '../domain/index.js';
import { logger } from '../../../shared/logging/logger.js';
import { derivePickupOtp, type RideNotifierPort } from '../domain/index.js';
import { toRideView, type RideView } from './rides.presenter.js';
import {
  cancelRideSchema,
  counterResponseSchema,
  driverCounterSchema,
  createRideHeadersSchema,
  driverEarningsQuerySchema,
  driverHistoryQuerySchema,
  createRideRequestSchema,
  listPaymentDisputesQuerySchema,
  listRidesQuerySchema,
  paymentDisputeSchema,
  paymentDisputeResolutionSchema,
  proposeFareSchema,
  reconcileDriverEarningsSchema,
  rideIdParamSchema,
  startRideRequestSchema,
  submitRideRatingSchema,
  waiveCancellationFeeSchema,
} from './rides.validation.js';

/** Maps an authenticated user id to the rider / driver profile id that rides reference. */
export interface RideHttpContext {
  notifier?: RideNotifierPort | undefined;
  /** Enables rider-visible pickup OTPs (see derivePickupOtp). */
  pickupOtpSecret?: string | undefined;
  resolveRiderId: (userId: string) => Promise<string | null>;
  resolveDriverId: (userId: string) => Promise<string | null>;
  resolveAssignedDriver?:
    | ((driverId: string, vehicleId: string | null) => Promise<RideAssignedDriverDto | null>)
    | undefined;
}

const ADMIN_ROLES: ReadonlySet<string> = new Set([
  'SUPER_ADMIN',
  'CITY_ADMIN',
  'SUPPORT_ADMIN',
  'FINANCE_ADMIN',
]);

/** Realtime fan-out is best effort: a failure must never fail the request that caused it. */
async function notify(work: Promise<void> | undefined): Promise<void> {
  try {
    await work;
  } catch (err) {
    logger.warn({ err: String(err) }, 'ride realtime notification failed');
  }
}

async function toEnrichedRideView(ride: RideEntity, actors?: RideHttpContext): Promise<RideView> {
  if (!ride.driverId || !actors?.resolveAssignedDriver) {
    return toRideView(ride, null);
  }
  try {
    const assignedDriver = await actors.resolveAssignedDriver(ride.driverId, ride.vehicleId);
    return toRideView(ride, assignedDriver);
  } catch {
    return toRideView(ride, null);
  }
}

function classifyPaymentCollection(
  paymentAudit: readonly RideEventEntity[],
): 'CASH' | 'RAZORPAY_UPI' | 'RAZORPAY_TEST' | 'DIRECT' {
  const confirmedMethod = paymentAudit.find((event) => event.eventType === 'PAYMENT_CONFIRMED')
    ?.metadata.method;
  const cash =
    confirmedMethod !== 'UPI' &&
    paymentAudit.some(
      (event) => event.eventType === 'PAYMENT_METHOD_CHANGED' && event.metadata.method === 'CASH',
    );
  if (cash) return 'CASH';
  if (paymentAudit.some((event) => event.eventType === 'UPI_QR_CREATED')) return 'RAZORPAY_UPI';
  if (paymentAudit.some((event) => event.eventType === 'UPI_ORDER_CREATED')) return 'RAZORPAY_TEST';
  return 'DIRECT';
}

const OTP_VISIBLE = new Set(['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED']);

function auth(req: Request) {
  if (!req.auth) throw AppError.unauthenticated('Authentication required.');
  return req.auth;
}

function assertCityAdminRideScope(req: Request, ride: RideEntity): void {
  if (req.auth?.role !== 'CITY_ADMIN') return;
  const allowed = req.adminCityZoneIds ?? [];
  const rideCity = ride.zoneSnapshot?.cityZoneId ?? null;
  if (!rideCity || !allowed.includes(rideCity)) {
    throw AppError.forbidden('ADMIN_SCOPE_DENIED: Ride is outside your assigned cities.');
  }
}

async function requireRiderId(req: Request, actors: RideHttpContext): Promise<string> {
  const { role, userId } = auth(req);
  if (role === 'RIDER') {
    const id = await actors.resolveRiderId(userId);
    if (!id) throw AppError.forbidden('RIDER_PROFILE_REQUIRED: No rider profile for this account.');
    return id;
  }
  throw AppError.forbidden('RIDER_PROFILE_REQUIRED: No rider profile for this account.');
}

async function requireDriverId(req: Request, actors: RideHttpContext): Promise<string> {
  const { role, userId } = auth(req);
  if (role === 'DRIVER') {
    const id = await actors.resolveDriverId(userId);
    if (!id)
      throw AppError.forbidden('DRIVER_PROFILE_REQUIRED: No driver profile for this account.');
    return id;
  }
  throw AppError.forbidden('DRIVER_PROFILE_REQUIRED: No driver profile for this account.');
}

async function canView(req: Request, ride: RideEntity, actors: RideHttpContext): Promise<boolean> {
  const { role, userId } = auth(req);
  if (ADMIN_ROLES.has(role)) {
    assertCityAdminRideScope(req, ride);
    return true;
  }
  if (role === 'RIDER') {
    const riderId = await actors.resolveRiderId(userId);
    return (
      riderId !== null && (ride.bookerRiderId === riderId || ride.passenger.riderId === riderId)
    );
  }
  if (role === 'DRIVER') {
    const driverId = await actors.resolveDriverId(userId);
    return driverId !== null && ride.driverId === driverId;
  }
  return false;
}

export function makeCreateRideController(
  useCase: CreateRideUseCase,
  actors: RideHttpContext,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const headers = createRideHeadersSchema.parse({
      'idempotency-key': req.get('Idempotency-Key') || undefined,
    });
    const body = createRideRequestSchema.parse(req.body);
    const headerKey = headers['idempotency-key'];
    if (headerKey && body.idempotencyKey && headerKey !== body.idempotencyKey) {
      throw AppError.badRequest(
        'IDEMPOTENCY_KEY_MISMATCH: Idempotency-Key header and body idempotencyKey must match.',
      );
    }
    const riderId = await requireRiderId(req, actors);
    const { ride, replayed } = await useCase.executeWithMeta({
      quoteToken: body.quoteToken,
      proposedFarePaise: body.proposedFarePaise,
      riderId,
      passengerName: body.passenger.name,
      passengerPhoneE164: body.passenger.phoneE164,
      pickup: body.pickup,
      drop: body.drop,
      vehicleCategory: body.vehicleCategory,
      idempotencyKey: headerKey ?? body.idempotencyKey,
      paymentMethod: body.paymentMethod,
    });
    if (!replayed) {
      await notify(actors.notifier?.rideRequested(ride));
    }
    sendSuccess(
      req,
      res,
      await toEnrichedRideView(ride, actors),
      replayed ? 'Ride request replayed' : 'Ride requested successfully',
      replayed ? 200 : 201,
    );
  });
}

export function makeGetRideController(
  rideRepo: RideRepositoryPort,
  actors: RideHttpContext,
  paymentEvents?: RideEventRepositoryPort,
  driverEarnings?: DriverEarningsUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = rideIdParamSchema.parse(req.params);
    const ride = await rideRepo.findById(id);
    // Same response for missing and foreign rides so ids cannot be probed.
    if (!ride || !(await canView(req, ride, actors))) {
      throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
    }
    const isRider = req.auth?.role === 'RIDER';
    const pickupOtp =
      isRider &&
      actors.pickupOtpSecret &&
      ride.passenger.pickupOtpExpiresAt &&
      OTP_VISIBLE.has(ride.status)
        ? derivePickupOtp(actors.pickupOtpSecret, ride.id, ride.passenger.pickupOtpExpiresAt)
        : undefined;
    const view = await toEnrichedRideView(ride, actors);
    const paymentAudit = paymentEvents ? await paymentEvents.findByRideId(ride.id) : [];
    const paymentCollection = classifyPaymentCollection(paymentAudit);
    const includeDriverSettlement =
      driverEarnings && (req.auth?.role === 'DRIVER' || ADMIN_ROLES.has(req.auth?.role ?? ''));
    const driverSettlement = includeDriverSettlement
      ? (await driverEarnings.buildSettlementMap([ride])).get(ride.id)
      : undefined;
    sendSuccess(
      req,
      res,
      {
        ...view,
        paymentCollection,
        ...(driverSettlement ? { driverSettlement } : {}),
        ...(pickupOtp ? { pickupOtp } : {}),
      },
      'Ride retrieved successfully',
    );
  });
}

/** Ordered audit trail of a ride. Visible to whoever can view the ride. */
export function makeRideEventsController(
  rideRepo: RideRepositoryPort,
  rideEventRepo: RideEventRepositoryPort,
  actors: RideHttpContext,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = rideIdParamSchema.parse(req.params);
    const ride = await rideRepo.findById(id);
    const isOfferingDriver =
      ride?.status === 'OFFERING' &&
      req.auth?.role === 'DRIVER' &&
      (await actors.resolveDriverId(req.auth.userId)) !== null;
    if (!ride || (!(await canView(req, ride, actors)) && !isOfferingDriver)) {
      throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
    }
    const events = await rideEventRepo.findByRideId(id);
    events.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    sendSuccess(req, res, events, 'Ride events retrieved successfully');
  });
}

/** Rider: own rides. Driver: assigned rides. Admin: any (scoped to assigned cities for CITY_ADMIN). */
export function makeListRidesController(
  rideRepo: RideRepositoryPort,
  actors: RideHttpContext,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const q = listRidesQuerySchema.parse(req.query);
    const { role, userId } = auth(req);

    let riderId = q.riderId;
    let driverId = q.driverId;
    if (role === 'RIDER') {
      riderId = (await actors.resolveRiderId(userId)) ?? undefined;
      driverId = undefined;
      if (!riderId) return sendSuccess(req, res, [], 'Rides retrieved successfully');
    } else if (role === 'DRIVER') {
      driverId = (await actors.resolveDriverId(userId)) ?? undefined;
      riderId = undefined;
      if (!driverId) return sendSuccess(req, res, [], 'Rides retrieved successfully');
    } else if (!ADMIN_ROLES.has(role)) {
      throw AppError.forbidden('Insufficient permissions.');
    }

    const cityZoneIds = role === 'CITY_ADMIN' ? (req.adminCityZoneIds ?? []) : req.adminCityZoneIds;

    const rides = await rideRepo.list({
      riderId,
      driverId,
      statuses: q.status,
      ...(cityZoneIds !== undefined ? { cityZoneIds } : {}),
      limit: q.limit,
      offset: q.offset,
    });
    const views = await Promise.all(rides.map((r) => toEnrichedRideView(r, actors)));
    sendSuccess(req, res, views, 'Rides retrieved successfully');
  });
}

export function makeDriverEarningsSummaryController(
  useCase: DriverEarningsUseCase,
  actors: RideHttpContext,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { period } = driverEarningsQuerySchema.parse(req.query);
    const driverId = await requireDriverId(req, actors);
    const summary = await useCase.getSummary(driverId, period);
    sendSuccess(req, res, summary, 'Driver earnings summary retrieved successfully');
  });
}

export function makeDriverHistoryController(
  rideRepo: RideRepositoryPort,
  useCase: DriverEarningsUseCase,
  actors: RideHttpContext,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const q = driverHistoryQuerySchema.parse(req.query);
    const driverId = await requireDriverId(req, actors);
    const [total, rides] = await Promise.all([
      rideRepo.count({ driverId, statuses: q.status }),
      rideRepo.list({
        driverId,
        statuses: q.status,
        limit: q.limit,
        offset: q.offset,
      }),
    ]);
    const [views, settlements] = await Promise.all([
      Promise.all(rides.map((r) => toEnrichedRideView(r, actors))),
      useCase.buildSettlementMap(rides),
    ]);
    const items = views.map((v) => {
      const driverSettlement = settlements.get(v.id);
      return driverSettlement ? { ...v, driverSettlement } : v;
    });
    sendSuccess(
      req,
      res,
      {
        items,
        total,
        limit: q.limit,
        offset: q.offset,
        hasMore: q.offset + items.length < total,
      },
      'Driver ride history retrieved successfully',
    );
  });
}

export function makeReconcileDriverEarningsController(
  useCase: DriverEarningsUseCase,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { userId } = auth(req);
    const body = reconcileDriverEarningsSchema.parse(req.body ?? {});
    const report = await useCase.reconcile({
      mode: body.mode,
      driverId: body.driverId,
      rideIds: body.rideIds,
      verifyProvider: body.verifyProvider,
      adminId: userId,
    });
    sendSuccess(req, res, report, 'Driver earnings reconciliation completed');
  });
}

export function makeAcceptRideController(
  useCase: AcceptRideUseCase,
  actors: RideHttpContext,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = rideIdParamSchema.parse(req.params);
    const driverId = await requireDriverId(req, actors);
    // Pickup OTP is delivered to the rider only.
    const { ride, _riderPickupOtp } = await useCase.execute({ rideId: id, driverId });
    await notify(
      actors.notifier?.rideUpdated(ride, 'ride.driver.assigned', { pickupOtp: _riderPickupOtp }),
    );
    const view = await toEnrichedRideView(ride, actors);
    sendSuccess(req, res, view, 'Ride accepted successfully');
  });
}

/** Driver: answer an offer with a different fare. The rider is notified in realtime. */
export function makeDriverCounterController(
  useCase: NegotiateFareUseCase,
  actors: RideHttpContext,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = rideIdParamSchema.parse(req.params);
    const { proposedFarePaise } = driverCounterSchema.parse(req.body);
    const driverId = await requireDriverId(req, actors);
    const driverSummary = await actors.resolveAssignedDriver?.(driverId, null).catch(() => null);
    const vehicleLabel = driverSummary?.vehicle
      ? [
          [driverSummary.vehicle.color, driverSummary.vehicle.make, driverSummary.vehicle.model]
            .filter(Boolean)
            .join(' '),
          driverSummary.vehicle.registrationNumber,
        ]
          .filter(Boolean)
          .join(' · ')
      : null;
    const { ride, counter } = await useCase.counter({
      rideId: id,
      driverId,
      proposedFarePaise,
      driverName: driverSummary?.name ?? null,
      vehicleLabel,
    });
    await notify(actors.notifier?.fareNegotiation(ride, 'ride.fare.countered', counter));
    sendSuccess(req, res, counter, 'Counter-offer sent to rider', 201);
  });
}

export function makeRaiseFareController(
  useCase: NegotiateFareUseCase,
  actors: RideHttpContext,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = rideIdParamSchema.parse(req.params);
    const { proposedFarePaise } = proposeFareSchema.parse(req.body);
    const riderId = await requireRiderId(req, actors);
    const ride = await useCase.raise({ rideId: id, riderId, proposedFarePaise });
    await notify(actors.notifier?.rideUpdated(ride, 'ride.fare.raised', { proposedFarePaise }));
    sendSuccess(req, res, await toEnrichedRideView(ride, actors), 'Fare raised successfully');
  });
}

/** Rider: take or decline a driver's counter. Taking it assigns that driver at the countered fare. */
export function makeRespondCounterController(
  useCase: NegotiateFareUseCase,
  actors: RideHttpContext,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = rideIdParamSchema.parse(req.params);
    const { driverId, action } = counterResponseSchema.parse(req.body);
    const riderId = await requireRiderId(req, actors);
    const result = await useCase.respond({ rideId: id, riderId, driverId, action });
    if (action === 'ACCEPTED' && result.accepted) {
      await notify(
        actors.notifier?.rideUpdated(result.ride, 'ride.driver.assigned', {
          pickupOtp: result.accepted._riderPickupOtp,
          viaCounter: true,
        }),
      );
    } else {
      await notify(
        actors.notifier?.fareNegotiation(result.ride, 'ride.fare.counter_rejected', result.counter),
      );
    }
    sendSuccess(
      req,
      res,
      await toEnrichedRideView(result.ride, actors),
      `Counter-offer ${action.toLowerCase()}`,
    );
  });
}

export function makeDriverEnRouteController(
  useCase: DriverEnRouteUseCase,
  actors: RideHttpContext,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = rideIdParamSchema.parse(req.params);
    const driverId = await requireDriverId(req, actors);
    const ride = await useCase.execute({ rideId: id, driverId });
    await notify(actors.notifier?.rideUpdated(ride, 'ride.driver.en_route'));
    sendSuccess(req, res, await toEnrichedRideView(ride, actors), 'Driver is en route');
  });
}

export function makeDriverArrivedController(
  useCase: DriverArrivedUseCase,
  actors: RideHttpContext,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = rideIdParamSchema.parse(req.params);
    const driverId = await requireDriverId(req, actors);
    const ride = await useCase.execute({ rideId: id, driverId });
    await notify(actors.notifier?.rideUpdated(ride, 'ride.driver.arrived'));
    sendSuccess(req, res, await toEnrichedRideView(ride, actors), 'Driver has arrived');
  });
}

export function makeStartRideController(
  useCase: StartRideUseCase,
  actors: RideHttpContext,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = rideIdParamSchema.parse(req.params);
    const { otp } = startRideRequestSchema.parse(req.body);
    const driverId = await requireDriverId(req, actors);
    const ride = await useCase.execute({ rideId: id, driverId, otp });
    await notify(actors.notifier?.rideUpdated(ride, 'ride.started'));
    sendSuccess(req, res, await toEnrichedRideView(ride, actors), 'Trip started');
  });
}

export function makeCompleteRideController(
  useCase: CompleteRideUseCase,
  actors: RideHttpContext,
  confirmPayment = false,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = rideIdParamSchema.parse(req.params);
    const driverId = await requireDriverId(req, actors);
    const result = await (confirmPayment
      ? useCase.confirmPayment({ rideId: id, driverId })
      : useCase.execute({ rideId: id, driverId }));
    const arrearsCollectedPaise = result.arrearsCollectedPaise ?? 0;
    const totalPayablePaise = result.totalPayablePaise ?? result.farePaise;
    await notify(
      actors.notifier?.rideUpdated(
        result.ride,
        confirmPayment ? 'ride.payment.confirmed' : 'ride.completed',
        { farePaise: result.farePaise, arrearsCollectedPaise, totalPayablePaise },
      ),
    );
    sendSuccess(
      req,
      res,
      {
        ride: await toEnrichedRideView(result.ride, actors),
        farePaise: result.farePaise,
        commissionPaise: result.commissionPaise,
        arrearsCollectedPaise,
        totalPayablePaise,
        walletBalancePaise: result.driverWallet.balancePaise,
      },
      confirmPayment
        ? 'Payment received and ride settled'
        : 'Trip completed; awaiting payment confirmation',
    );
  });
}

export function makeDisputePaymentController(
  useCase: CompleteRideUseCase,
  actors: RideHttpContext,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = rideIdParamSchema.parse(req.params);
    const { reason } = paymentDisputeSchema.parse(req.body);
    const riderId = await requireRiderId(req, actors);
    const ride = await useCase.disputePayment({ rideId: id, riderId, reason });
    await notify(actors.notifier?.rideUpdated(ride, 'ride.payment.disputed'));
    sendSuccess(req, res, await toEnrichedRideView(ride, actors), 'Payment dispute filed');
  });
}

export function makeResolvePaymentDisputeController(
  useCase: CompleteRideUseCase,
  actors: RideHttpContext,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = rideIdParamSchema.parse(req.params);
    const { outcome, reason, refundReference } = paymentDisputeResolutionSchema.parse(req.body);
    const ride = await useCase.resolveDispute({
      rideId: id,
      adminId: auth(req).userId,
      outcome,
      reason,
      refundReference,
    });
    await notify(actors.notifier?.rideUpdated(ride, 'ride.payment.dispute_resolved', { outcome }));
    sendSuccess(req, res, await toEnrichedRideView(ride, actors), 'Payment dispute resolved');
  });
}

export function makeListPaymentDisputesController(
  rideRepo: RideRepositoryPort,
  eventRepo: RideEventRepositoryPort,
  actors?: RideHttpContext,
  walletRepo?: WalletRepositoryPort,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { status, collection, search, limit, offset } = listPaymentDisputesQuerySchema.parse(
      req.query,
    );
    const normalizedSearch = search?.trim().toLowerCase() ?? '';
    const hasPostFilter = collection !== 'ALL' || normalizedSearch.length > 0;
    const scanLimit = hasPostFilter ? 500 : limit + offset;

    let rides: RideEntity[];
    if (status === 'OPEN') {
      rides = await rideRepo.list({
        statuses: ['PAYMENT_DISPUTED'],
        limit: hasPostFilter ? scanLimit : limit,
        offset: hasPostFilter ? 0 : offset,
      });
    } else if (status === 'RESOLVED') {
      const resolvedEvents = await eventRepo.findByEventTypes(
        ['PAYMENT_DISPUTE_RESOLVED'],
        scanLimit,
        0,
      );
      const uniqueIds: string[] = [];
      for (const ev of resolvedEvents) {
        if (!uniqueIds.includes(ev.rideId)) uniqueIds.push(ev.rideId);
      }
      const candidateIds = hasPostFilter ? uniqueIds : uniqueIds.slice(offset, offset + limit);
      const fetched = await Promise.all(candidateIds.map((id) => rideRepo.findById(id)));
      rides = fetched.filter((r): r is RideEntity => r !== null && r.status !== 'PAYMENT_DISPUTED');
    } else {
      const [openRides, resolvedEvents] = await Promise.all([
        rideRepo.list({ statuses: ['PAYMENT_DISPUTED'], limit: scanLimit, offset: 0 }),
        eventRepo.findByEventTypes(['PAYMENT_DISPUTE_RESOLVED'], scanLimit, 0),
      ]);
      const byId = new Map<string, RideEntity>(openRides.map((r) => [r.id, r]));
      const missingIds = [...new Set(resolvedEvents.map((e) => e.rideId))].filter(
        (id) => !byId.has(id),
      );
      const resolvedRides = await Promise.all(missingIds.map((id) => rideRepo.findById(id)));
      for (const r of resolvedRides) {
        if (r) byId.set(r.id, r);
      }
      const merged = [...byId.values()].sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
      );
      rides = hasPostFilter ? merged : merged.slice(offset, offset + limit);
    }

    const rideIds = rides.map((r) => r.id);
    const [allEvents, txPage] =
      rideIds.length > 0
        ? await Promise.all([
            eventRepo.findByRideIds(rideIds),
            walletRepo
              ? walletRepo.listTransactions({
                  referenceIds: rideIds,
                  referenceTypes: [
                    'RIDE_COMMISSION',
                    'ONLINE_RIDE_EARNINGS',
                    'ONLINE_EARNINGS_REVERSAL',
                    'DISPUTE_REFUND',
                  ],
                  limit: 1000,
                  offset: 0,
                })
              : Promise.resolve({ items: [] as WalletTransactionDto[], total: 0 }),
          ])
        : [[], { items: [] as WalletTransactionDto[], total: 0 }];

    const eventsByRide = new Map<string, RideEventEntity[]>();
    for (const ev of allEvents) {
      const list = eventsByRide.get(ev.rideId) ?? [];
      list.push(ev);
      eventsByRide.set(ev.rideId, list);
    }

    const txsByRide = new Map<string, WalletTransactionDto[]>();
    for (const tx of txPage.items) {
      if (!tx.referenceId) continue;
      const list = txsByRide.get(tx.referenceId) ?? [];
      list.push(tx);
      txsByRide.set(tx.referenceId, list);
    }

    let data = await Promise.all(
      rides.map(async (ride) => {
        const events = eventsByRide.get(ride.id) ?? (await eventRepo.findByRideId(ride.id));
        const txs = txsByRide.get(ride.id) ?? [];
        const disputeEvents = events.filter((e) => e.eventType === 'PAYMENT_DISPUTED');
        const ticket = disputeEvents[disputeEvents.length - 1] ?? null;
        const resolution = events.find((e) => e.eventType === 'PAYMENT_DISPUTE_RESOLVED') ?? null;
        const confirmedEvent = events.find((e) => e.eventType === 'PAYMENT_CONFIRMED');
        const upiOrderEvent = events.find((e) => e.eventType === 'UPI_ORDER_CREATED');
        const qrEvent = events.find((e) => e.eventType === 'UPI_QR_CREATED');
        const paymentCollection = classifyPaymentCollection(events);

        const commissionDebit = txs.find(
          (t) => t.referenceType === 'RIDE_COMMISSION' && t.type === 'DEBIT',
        );
        const onlineCredit = txs.find(
          (t) => t.referenceType === 'ONLINE_RIDE_EARNINGS' && t.type === 'CREDIT',
        );
        const onlineReversals = txs.filter(
          (t) => t.referenceType === 'ONLINE_EARNINGS_REVERSAL' && t.type === 'DEBIT',
        );
        const onlineReversalSum = onlineReversals.reduce((s, t) => s + t.amountPaise, 0);
        const disputeRefund = txs.find(
          (t) => t.referenceType === 'DISPUTE_REFUND' && t.type === 'CREDIT',
        );
        const farePaise = ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise;
        const onlineCommissionPaise = onlineCredit
          ? Math.max(0, farePaise - onlineCredit.amountPaise)
          : 0;

        const providerOrderId =
          typeof upiOrderEvent?.metadata?.orderId === 'string'
            ? upiOrderEvent.metadata.orderId
            : typeof confirmedEvent?.metadata?.orderId === 'string'
              ? confirmedEvent.metadata.orderId
              : typeof ticket?.metadata?.orderId === 'string'
                ? ticket.metadata.orderId
                : null;
        const providerPaymentId =
          typeof confirmedEvent?.metadata?.paymentId === 'string'
            ? confirmedEvent.metadata.paymentId
            : typeof ticket?.metadata?.paymentId === 'string'
              ? ticket.metadata.paymentId
              : null;
        const providerQrId =
          typeof qrEvent?.metadata?.qrId === 'string'
            ? qrEvent.metadata.qrId
            : typeof confirmedEvent?.metadata?.qrId === 'string'
              ? confirmedEvent.metadata.qrId
              : typeof ticket?.metadata?.qrId === 'string'
                ? ticket.metadata.qrId
                : null;
        const providerRefundReference =
          typeof resolution?.metadata?.refundReference === 'string'
            ? resolution.metadata.refundReference
            : null;
        const isDuplicateUpiAfterCash = Boolean(
          confirmedEvent &&
          confirmedEvent.metadata?.method !== 'UPI' &&
          typeof ticket?.metadata?.paymentId === 'string',
        );
        const hasOnlineConfirmation = confirmedEvent?.metadata?.method === 'UPI';
        const requiresManualProviderRefund = Boolean(
          hasOnlineConfirmation || isDuplicateUpiAfterCash,
        );
        const providerMode =
          confirmedEvent?.metadata?.mode === 'live' || confirmedEvent?.metadata?.mode === 'test'
            ? confirmedEvent.metadata.mode
            : qrEvent
              ? 'live'
              : upiOrderEvent
                ? 'test'
                : null;
        const receiptReference =
          providerPaymentId ??
          providerQrId ??
          providerOrderId ??
          (confirmedEvent ? `CASH-${ride.id.slice(0, 8).toUpperCase()}` : null);

        return {
          ride: await toEnrichedRideView(ride, actors),
          ticket,
          resolution,
          evidence: {
            paymentCollection,
            paymentMethod:
              typeof confirmedEvent?.metadata?.method === 'string'
                ? confirmedEvent.metadata.method
                : paymentCollection === 'CASH' || paymentCollection === 'DIRECT'
                  ? 'CASH'
                  : null,
            paymentConfirmedAt: confirmedEvent ? confirmedEvent.createdAt.toISOString() : null,
            providerMode,
            providerOrderId,
            providerPaymentId,
            providerQrId,
            providerRefundReference,
            receiptReference,
            isDuplicateUpiAfterCash,
            requiresManualProviderRefund,
            commissionChargedPaise: commissionDebit?.amountPaise ?? onlineCommissionPaise,
            commissionRefundedPaise:
              disputeRefund?.amountPaise ??
              (typeof resolution?.metadata?.refundedCommissionPaise === 'number'
                ? resolution.metadata.refundedCommissionPaise
                : 0),
            refundTransactionId: disputeRefund?.id ?? null,
            onlineEarningsCreditedPaise: onlineCredit?.amountPaise ?? 0,
            onlineEarningsReversedPaise:
              onlineReversalSum > 0
                ? onlineReversalSum
                : typeof resolution?.metadata?.reversedOnlineEarningsPaise === 'number'
                  ? resolution.metadata.reversedOnlineEarningsPaise
                  : 0,
            reversalTransactionId: onlineReversals[0]?.id ?? null,
          },
        };
      }),
    );

    if (hasPostFilter) {
      data = data.filter((item) => {
        const isOnline =
          item.evidence.paymentCollection === 'RAZORPAY_UPI' ||
          item.evidence.paymentCollection === 'RAZORPAY_TEST' ||
          item.evidence.isDuplicateUpiAfterCash;
        if (collection === 'ONLINE' && !isOnline) return false;
        if (collection === 'CASH' && isOnline) return false;
        if (!normalizedSearch) return true;
        const fields = [
          item.ride.id,
          item.ride.passenger.name,
          item.ride.passenger.phoneE164,
          item.ride.assignedDriver?.name ?? '',
          item.ride.assignedDriver?.phoneE164 ?? '',
          item.ride.assignedDriver?.vehicle?.registrationNumber ?? '',
          item.evidence.providerOrderId ?? '',
          item.evidence.providerPaymentId ?? '',
          item.evidence.providerQrId ?? '',
          item.evidence.providerRefundReference ?? '',
          item.evidence.receiptReference ?? '',
          item.evidence.refundTransactionId ?? '',
          item.evidence.reversalTransactionId ?? '',
          typeof item.ticket?.metadata?.reason === 'string' ? item.ticket.metadata.reason : '',
          typeof item.resolution?.metadata?.reason === 'string'
            ? item.resolution.metadata.reason
            : '',
          typeof item.resolution?.metadata?.outcome === 'string'
            ? item.resolution.metadata.outcome
            : '',
        ];
        return fields.some((val) => val.toLowerCase().includes(normalizedSearch));
      });
      data = data.slice(offset, offset + limit);
    }

    sendSuccess(
      req,
      res,
      data,
      status === 'OPEN' ? 'Open payment disputes retrieved' : 'Payment disputes retrieved',
    );
  });
}

export function makeCancelRideController(
  useCase: CancelRideUseCase,
  actors: RideHttpContext,
  rideRepo?: RideRepositoryPort,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = rideIdParamSchema.parse(req.params);
    const { role, userId } = auth(req);

    let actorType: 'RIDER' | 'DRIVER' | 'ADMIN';
    let actorId: string;
    if (role === 'RIDER') {
      actorType = 'RIDER';
      actorId = await requireRiderId(req, actors);
    } else if (role === 'DRIVER') {
      actorType = 'DRIVER';
      actorId = await requireDriverId(req, actors);
    } else if (ADMIN_ROLES.has(role)) {
      if (role === 'CITY_ADMIN' && rideRepo) {
        const ride = await rideRepo.findById(id);
        if (ride) assertCityAdminRideScope(req, ride);
      }
      actorType = 'ADMIN';
      actorId = userId;
    } else {
      throw AppError.forbidden('Insufficient permissions.');
    }

    const { reason } = cancelRideSchema.parse(req.body);

    const result = await useCase.execute({ rideId: id, actorType, actorId, reason });
    const riderArrearsPaise = result.riderWallet
      ? Math.max(0, -result.riderWallet.balancePaise)
      : 0;
    await notify(actors.notifier?.rideUpdated(result.ride, 'ride.cancelled', { reason }));
    sendSuccess(
      req,
      res,
      {
        ride: await toEnrichedRideView(result.ride, actors),
        feeBreakdown: result.feeBreakdown,
        riderArrearsPaise,
      },
      'Ride cancelled',
    );
  });
}

export function makeGetRideRatingController(
  rideRepo: RideRepositoryPort,
  ratingsUseCase: RideRatingsUseCase,
  actors: RideHttpContext,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = rideIdParamSchema.parse(req.params);
    const ride = await rideRepo.findById(id);
    if (!ride || !(await canView(req, ride, actors))) {
      throw AppError.notFound('RIDE_NOT_FOUND: The requested ride was not found.');
    }

    const { role, userId } = auth(req);
    let viewerRole: 'RIDER' | 'DRIVER' | 'ADMIN' = 'ADMIN';
    let viewerProfileId: string | null = null;
    if (role === 'RIDER') {
      viewerRole = 'RIDER';
      viewerProfileId = await actors.resolveRiderId(userId);
    } else if (role === 'DRIVER') {
      viewerRole = 'DRIVER';
      viewerProfileId = await actors.resolveDriverId(userId);
    }

    const status = await ratingsUseCase.getRatingStatus({
      ride,
      viewerRole,
      viewerProfileId,
    });
    sendSuccess(req, res, status, 'Ride rating status retrieved successfully');
  });
}

export function makeSubmitRideRatingController(
  rideRepo: RideRepositoryPort,
  ratingsUseCase: RideRatingsUseCase,
  actors: RideHttpContext,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = rideIdParamSchema.parse(req.params);
    const body = submitRideRatingSchema.parse(req.body);
    const { role } = auth(req);

    let actorRole: 'RIDER' | 'DRIVER';
    let actorProfileId: string;
    if (role === 'RIDER') {
      actorRole = 'RIDER';
      actorProfileId = await requireRiderId(req, actors);
    } else if (role === 'DRIVER') {
      actorRole = 'DRIVER';
      actorProfileId = await requireDriverId(req, actors);
    } else {
      throw AppError.forbidden(
        'RATING_PARTICIPANT_REQUIRED: Only riders and drivers can submit ride ratings.',
      );
    }

    const result = await ratingsUseCase.submitRating({
      rideId: id,
      actorRole,
      actorProfileId,
      stars: body.stars,
      tags: body.tags,
      comment: body.comment,
    });

    // Double-blind privacy: only emit realtime notification when ratings are revealed
    if (result.status.myReview?.status === 'REVEALED') {
      const ride = await rideRepo.findById(id);
      if (ride) {
        await notify(actors.notifier?.rideUpdated(ride, 'ride.rating.revealed', { rideId: id }));
      }
    }

    sendSuccess(
      req,
      res,
      result.status,
      result.created ? 'Ride rating submitted successfully' : 'Ride rating already recorded',
      result.created ? 201 : 200,
    );
  });
}

export function makeWaiveCancellationFeeController(
  useCase: CancelRideUseCase,
  actors: RideHttpContext,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = rideIdParamSchema.parse(req.params);
    const { reason } = waiveCancellationFeeSchema.parse(req.body);
    const result = await useCase.waiveCancellationFee({
      rideId: id,
      adminId: auth(req).userId,
      reason,
    });
    await notify(
      actors.notifier?.rideUpdated(result.ride, 'ride.cancellation_fee.waived', {
        waivedPaise: result.waivedPaise,
      }),
    );
    sendSuccess(
      req,
      res,
      {
        ride: await toEnrichedRideView(result.ride, actors),
        waivedPaise: result.waivedPaise,
        riderWalletBalancePaise: result.riderWallet.balancePaise,
        riderArrearsPaise: Math.max(0, -result.riderWallet.balancePaise),
      },
      'Cancellation fee waived',
    );
  });
}
