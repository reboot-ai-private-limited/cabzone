import type { Request, RequestHandler, Response } from 'express';
import type { RideAssignedDriverDto } from '@cabzone/contracts';
import { AppError } from '../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import type { AcceptRideUseCase } from '../application/useCases/acceptRide.usecase.js';
import type { CancelRideUseCase } from '../application/useCases/cancelRide.usecase.js';
import type { CompleteRideUseCase } from '../application/useCases/completeRide.usecase.js';
import type { CreateRideUseCase } from '../application/useCases/createRide.usecase.js';
import type { DriverArrivedUseCase } from '../application/useCases/driverArrived.usecase.js';
import type { DriverEnRouteUseCase } from '../application/useCases/driverEnRoute.usecase.js';
import type { StartRideUseCase } from '../application/useCases/startRide.usecase.js';
import type { NegotiateFareUseCase } from '../application/useCases/negotiateFare.usecase.js';
import type { RideRatingsUseCase } from '../application/useCases/rideRatings.usecase.js';
import type { RideEntity, RideEventRepositoryPort, RideRepositoryPort } from '../domain/index.js';
import { logger } from '../../../shared/logging/logger.js';
import { derivePickupOtp, type RideNotifierPort } from '../domain/index.js';
import { toRideView, type RideView } from './rides.presenter.js';
import {
  cancelRideSchema,
  counterResponseSchema,
  driverCounterSchema,
  createRideRequestSchema,
  listRidesQuerySchema,
  paymentDisputeSchema,
  paymentDisputeResolutionSchema,
  proposeFareSchema,
  rideIdParamSchema,
  startRideRequestSchema,
  submitRideRatingSchema,
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

const OTP_VISIBLE = new Set(['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED']);

function auth(req: Request) {
  if (!req.auth) throw AppError.unauthenticated('Authentication required.');
  return req.auth;
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
  if (ADMIN_ROLES.has(role)) return true;
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
    const body = createRideRequestSchema.parse(req.body);
    const riderId = await requireRiderId(req, actors);
    const ride = await useCase.execute({
      quoteToken: body.quoteToken,
      proposedFarePaise: body.proposedFarePaise,
      riderId,
      passengerName: body.passenger.name,
      passengerPhoneE164: body.passenger.phoneE164,
      pickup: body.pickup,
      drop: body.drop,
      vehicleCategory: body.vehicleCategory,
    });
    await notify(actors.notifier?.rideRequested(ride));
    sendSuccess(
      req,
      res,
      await toEnrichedRideView(ride, actors),
      'Ride requested successfully',
      201,
    );
  });
}

export function makeGetRideController(
  rideRepo: RideRepositoryPort,
  actors: RideHttpContext,
  paymentEvents?: RideEventRepositoryPort,
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
    const confirmedMethod = paymentAudit.find((event) => event.eventType === 'PAYMENT_CONFIRMED')
      ?.metadata.method;
    const cash =
      confirmedMethod !== 'UPI' &&
      paymentAudit.some(
        (event) => event.eventType === 'PAYMENT_METHOD_CHANGED' && event.metadata.method === 'CASH',
      );
    const paymentCollection = cash
      ? 'CASH'
      : paymentAudit.some((event) => event.eventType === 'UPI_QR_CREATED')
        ? 'RAZORPAY_UPI'
        : paymentAudit.some((event) => event.eventType === 'UPI_ORDER_CREATED')
          ? 'RAZORPAY_TEST'
          : 'DIRECT';
    sendSuccess(
      req,
      res,
      { ...view, paymentCollection, ...(pickupOtp ? { pickupOtp } : {}) },
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

/** Rider: own rides. Driver: assigned rides. Admin: any, filterable. */
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

    const rides = await rideRepo.list({
      riderId,
      driverId,
      statuses: q.status,
      limit: q.limit,
      offset: q.offset,
    });
    const views = await Promise.all(rides.map((r) => toEnrichedRideView(r, actors)));
    sendSuccess(req, res, views, 'Rides retrieved successfully');
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
        actors.notifier?.fareNegotiation(
          result.ride,
          'ride.fare.counter_rejected',
          result.counter,
        ),
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
    await notify(
      actors.notifier?.rideUpdated(
        result.ride,
        confirmPayment ? 'ride.payment.confirmed' : 'ride.completed',
        { farePaise: result.farePaise },
      ),
    );
    sendSuccess(
      req,
      res,
      {
        ride: await toEnrichedRideView(result.ride, actors),
        farePaise: result.farePaise,
        commissionPaise: result.commissionPaise,
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
    const { outcome, reason } = paymentDisputeResolutionSchema.parse(req.body);
    const ride = await useCase.resolveDispute({
      rideId: id,
      adminId: auth(req).userId,
      outcome,
      reason,
    });
    await notify(actors.notifier?.rideUpdated(ride, 'ride.payment.dispute_resolved', { outcome }));
    sendSuccess(req, res, await toEnrichedRideView(ride, actors), 'Payment dispute resolved');
  });
}

export function makeListPaymentDisputesController(
  rideRepo: RideRepositoryPort,
  eventRepo: RideEventRepositoryPort,
  actors?: RideHttpContext,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { limit, offset } = listRidesQuerySchema
      .pick({ limit: true, offset: true })
      .parse(req.query);
    const rides = await rideRepo.list({ statuses: ['PAYMENT_DISPUTED'], limit, offset });
    const data = await Promise.all(
      rides.map(async (ride) => ({
        ride: await toEnrichedRideView(ride, actors),
        ticket:
          (await eventRepo.findByRideId(ride.id)).find(
            (event) => event.eventType === 'PAYMENT_DISPUTED',
          ) ?? null,
      })),
    );
    sendSuccess(req, res, data, 'Open payment disputes retrieved');
  });
}

export function makeCancelRideController(
  useCase: CancelRideUseCase,
  actors: RideHttpContext,
): RequestHandler {
  return asyncHandler(async (req: Request, res: Response) => {
    const { id } = rideIdParamSchema.parse(req.params);
    const { reason } = cancelRideSchema.parse(req.body);
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
      actorType = 'ADMIN';
      actorId = userId;
    } else {
      throw AppError.forbidden('Insufficient permissions.');
    }

    const result = await useCase.execute({ rideId: id, actorType, actorId, reason });
    await notify(actors.notifier?.rideUpdated(result.ride, 'ride.cancelled', { reason }));
    sendSuccess(
      req,
      res,
      { ride: await toEnrichedRideView(result.ride, actors), feeBreakdown: result.feeBreakdown },
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
