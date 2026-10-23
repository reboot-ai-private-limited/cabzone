import type { RideUpiCheckoutDto } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import type {
  RideEntity,
  RideEventRepositoryPort,
  RideRepositoryPort,
} from '../../domain/index.js';
import type { RidePaymentGateway } from '../../domain/ridePayment.port.js';
import { saveRideTransition } from '../rideTransition.js';

export class RideUpiPaymentUseCase {
  constructor(
    private readonly deps: {
      rideRepo: RideRepositoryPort;
      rideEventRepo: RideEventRepositoryPort;
      unitOfWork: UnitOfWorkPort;
      gateway: RidePaymentGateway;
    },
  ) {}

  private async ownedRide(rideId: string, riderId: string): Promise<RideEntity> {
    const ride = await this.deps.rideRepo.findById(rideId);
    if (!ride) throw AppError.notFound('Ride not found.');
    if (ride.bookerRiderId !== riderId)
      throw AppError.forbidden('Only the booking customer can pay for this ride.');
    return ride;
  }

  private async order(rideId: string): Promise<string | null> {
    const events = await this.deps.rideEventRepo.findByRideId(rideId);
    const value = events.find((e) => e.eventType === 'UPI_ORDER_CREATED')?.metadata.orderId;
    return typeof value === 'string' ? value : null;
  }

  private fare(ride: RideEntity): number {
    const fare = ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise;
    if (!Number.isSafeInteger(fare) || fare < 100)
      throw AppError.badRequest('The ride fare must be at least ₹1.');
    return fare;
  }

  async create(rideId: string, riderId: string): Promise<RideUpiCheckoutDto> {
    const ride = await this.ownedRide(rideId, riderId);
    if (ride.status !== 'PAYMENT_PENDING')
      throw AppError.badRequest('This ride is not awaiting payment.');
    let orderId = await this.order(rideId);
    const amountPaise = this.fare(ride);
    if (!orderId) {
      const created = await this.deps.gateway.createOrder(amountPaise, rideId);
      // Persist one checkout choice before exposing an order; unused concurrent orders cannot be paid from the app.
      orderId = await this.deps.unitOfWork.run(async () => {
        const current = await this.ownedRide(rideId, riderId);
        if (current.status !== 'PAYMENT_PENDING')
          throw AppError.conflict('Ride payment state changed. Refresh the ride.');
        const existing = await this.order(rideId);
        if (existing) return existing;
        await saveRideTransition(
          this.deps.rideRepo,
          { ...current, version: current.version + 1, updatedAt: new Date() },
          current.version,
        );
        await this.deps.rideEventRepo.save({
          id: newUuid(),
          rideId,
          eventType: 'UPI_ORDER_CREATED',
          actorType: 'RIDER',
          actorId: riderId,
          previousStatus: current.status,
          newStatus: current.status,
          metadata: { orderId: created, amountPaise, provider: 'RAZORPAY', mode: 'test' },
          createdAt: new Date(),
        });
        return created;
      });
    }
    return {
      orderId,
      amountPaise,
      currency: 'INR',
      keyId: this.deps.gateway.keyId,
      testMode: true,
    };
  }

  async reconcile(
    rideId: string,
    riderId: string,
    proof?: { orderId: string; paymentId: string; signature: string },
  ): Promise<RideEntity> {
    const ride = await this.ownedRide(rideId, riderId);
    const orderId = await this.order(rideId);
    if (!orderId) return ride;
    if (proof) {
      if (proof.orderId !== orderId)
        throw AppError.badRequest('Payment order does not belong to this ride.');
      this.deps.gateway.verifySignature(orderId, proof.paymentId, proof.signature);
    }
    if (ride.status === 'SETTLED') return ride;
    if (ride.status !== 'PAYMENT_PENDING') throw AppError.conflict('Ride is not awaiting payment.');
    const farePaise = this.fare(ride);
    const paymentId = await this.deps.gateway.findCapturedPayment(orderId, farePaise);
    if (!paymentId) return ride;
    if (proof && proof.paymentId !== paymentId)
      throw AppError.badRequest('Captured payment does not match checkout.');
    return this.deps.unitOfWork.run(async () => {
      const current = await this.ownedRide(rideId, riderId);
      if (current.status === 'SETTLED') return current;
      if (
        current.status !== 'PAYMENT_PENDING' ||
        this.fare(current) !== farePaise ||
        !current.driverId
      )
        throw AppError.conflict('Ride payment state changed.');
      const commissionPercent = current.pricingSnapshot.commissionPercent;
      if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100)
        throw AppError.badRequest('Ride commission is invalid.');
      const commissionPaise = Math.round((farePaise * commissionPercent) / 100);
      const now = new Date();
      const settled = await saveRideTransition(
        this.deps.rideRepo,
        {
          ...current,
          status: 'SETTLED',
          settledAt: now,
          updatedAt: now,
          version: current.version + 1,
        },
        current.version,
      );
      const metadata = {
        provider: 'RAZORPAY',
        mode: 'test',
        method: 'UPI',
        orderId,
        paymentId,
        farePaise,
        commissionPaise,
        driverId: current.driverId,
        driverPayablePaise: farePaise - commissionPaise,
        confirmedAt: now.toISOString(),
      };
      for (const eventType of ['PAYMENT_CONFIRMED', 'DRIVER_PAYOUT_PENDING', 'RIDE_SETTLED']) {
        await this.deps.rideEventRepo.save({
          id: newUuid(),
          rideId,
          eventType,
          actorType: 'SYSTEM',
          actorId: null,
          previousStatus: 'PAYMENT_PENDING',
          newStatus: 'SETTLED',
          metadata,
          createdAt: now,
        });
      }
      return settled;
    });
  }
}
