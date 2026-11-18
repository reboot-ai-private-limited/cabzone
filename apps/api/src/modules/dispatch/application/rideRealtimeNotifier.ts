import { logger } from '../../../shared/logging/logger.js';
import type { RideChatMessageDto } from '@cabzone/contracts';
import type { RealtimePublisherPort } from '../../../shared/realtime/realtime.port.js';
import type {
  RideEntity,
  RideLifecycleEvent,
  RideNotifierPort,
  RideRepositoryPort,
} from '../../rides/rides.public.js';
import type { DriverLocationObserver } from './useCases/updateDriverLocation.usecase.js';
import type { DispatchLookups } from './dispatch.types.js';
import type { ExpoPushService, PushNotificationChannel } from './expoPush.service.js';
import type { OfferRecipientsPort } from './offerRecipients.port.js';
import { ACTIVE_RIDE_STATUSES } from './useCases/driverOfferEligibility.js';
import type { FindCandidateDriversUseCase } from './useCases/findCandidateDrivers.usecase.js';
import { toRideOffer } from './useCases/listDriverOffers.usecase.js';

const RIDER_PUSH_MESSAGES: Partial<
  Record<RideLifecycleEvent, { title: string; body: string }>
> = {
  'ride.driver.assigned': {
    title: 'Driver assigned',
    body: 'Your driver is confirmed. Open Cabzone to track the pickup.',
  },
  'ride.driver.arrived': {
    title: 'Driver arrived',
    body: 'Your driver is at the pickup point.',
  },
  'ride.started': {
    title: 'Trip started',
    body: 'Your Cabzone trip is underway.',
  },
  'ride.completed': {
    title: 'Trip completed',
    body: 'Review the final fare and complete payment in Cabzone.',
  },
  'ride.early_drop.declined': {
    title: 'Early drop declined',
    body: 'Your driver declined to end the trip early. Please continue to the destination.',
  },
  'ride.payment.unpaid': {
    title: 'Trip payment pending',
    body: 'Your trip fare is unpaid. Open Cabzone to pay via UPI.',
  },
  'ride.cancelled': {
    title: 'Ride cancelled',
    body: 'Your ride request was cancelled.',
  },
  'ride.offer.expired': {
    title: 'No driver matched yet',
    body: 'Your offer expired. Open Cabzone to request again or adjust the fare.',
  },
};

/**
 * Turns ride state changes into realtime events (websocket-contracts.md §5-7). Every event carries
 * rideVersion so clients can drop stale updates. Never throws: delivery is best effort and the
 * REST endpoints remain the source of truth.
 */
export class RideRealtimeNotifier implements RideNotifierPort, DriverLocationObserver {
  async chatMessage(ride: RideEntity, message: RideChatMessageDto): Promise<void> {
    const rider = await this.lookups.getUserIdForRider(ride.bookerRiderId);
    const driver = ride.driverId ? await this.lookups.getUserIdForDriver(ride.driverId) : null;
    const data = {
      rideId: ride.id,
      messageId: message.id,
      sequence: message.sequence,
      senderRole: message.senderRole,
    };
    const recipient = message.senderRole === 'RIDER' ? driver : rider;
    for (const userId of [rider, driver]) {
      if (userId) this.publisher.publishToUser(userId, 'ride.chat.message', data);
    }
    if (recipient) {
      await this.notifyBackgroundUser(recipient, {
        title: 'New ride message',
        body: 'Open Cabzone to read your message.',
        channelId: message.senderRole === 'RIDER' ? 'ride-offers' : 'ride-updates',
        data: { ...data, type: 'ride.chat.message' },
        expiresAt: new Date(Date.now() + 10 * 60_000),
        priority: 'normal',
      });
    }
  }

  constructor(
    private readonly publisher: RealtimePublisherPort,
    private readonly findCandidates: FindCandidateDriversUseCase,
    private readonly lookups: DispatchLookups,
    private readonly rideRepo: RideRepositoryPort,
    private readonly push?: ExpoPushService,
    private readonly offerRecipients?: OfferRecipientsPort,
  ) {}

  private async notifyBackgroundUser(
    userId: string,
    message: {
      title: string;
      body: string;
      channelId?: PushNotificationChannel;
      data?: Record<string, unknown>;
      expiresAt?: Date | null;
      priority?: 'normal' | 'high';
    },
  ): Promise<void> {
    if (!this.push) return;
    if (await this.publisher.isConnected(userId)) return;
    await this.push.notify([userId], message);
  }

  async rideRequested(ride: RideEntity): Promise<void> {
    try {
      const candidates = await this.findCandidates.execute(ride);
      if (ride.offeringExpiresAt) {
        await this.offerRecipients?.save(
          ride.id,
          candidates.map((driver) => driver.userId),
          ride.offeringExpiresAt,
        );
      }
      const riderTier = await this.lookups
        .getRiderTrustTier?.([ride.bookerRiderId])
        .then((tiers) => tiers.get(ride.bookerRiderId) ?? null)
        .catch(() => null);
      for (const driver of candidates) {
        this.publisher.publishToUser(
          driver.userId,
          'ride.offer.created',
          toRideOffer(ride, driver.distanceM, riderTier ?? null),
        );
      }
      // Presence is user-scoped; a foreground session suppresses push to that user's installations.
      const backgroundUsers = this.push
        ? (
            await Promise.all(
              candidates.map(async (d) => ({
                userId: d.userId,
                connected: await this.publisher.isConnected(d.userId),
              })),
            )
          )
            .filter((d) => !d.connected)
            .map((d) => d.userId)
        : [];
      void this.push?.notify(backgroundUsers, {
        title: 'New ride request',
        body: `₹${Math.round((ride.proposedFarePaise ?? ride.suggestedFarePaise) / 100)} offered. Open Cabzone to view the request.`,
        channelId: 'ride-offers-ring',
        data: { type: 'ride.offer.created', rideId: ride.id, rideVersion: ride.version },
        expiresAt: ride.offeringExpiresAt,
      });
      logger.info({ rideId: ride.id, offered: candidates.length }, 'ride offers dispatched');
    } catch (err) {
      logger.warn({ rideId: ride.id, err: String(err) }, 'offer dispatch failed');
    }
  }

  async rideUpdated(
    ride: RideEntity,
    event: RideLifecycleEvent,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      const { pickupOtp, ...shared } = extra;
      const base = {
        rideId: ride.id,
        rideVersion: ride.version,
        status: ride.status,
        driverId: ride.driverId,
        vehicleId: ride.vehicleId,
        ...shared,
      };

      const riderUserId = await this.lookups.getUserIdForRider(ride.bookerRiderId);
      if (riderUserId) {
        // The pickup OTP goes to the rider only; the driver must ask for it in person.
        this.publisher.publishToUser(
          riderUserId,
          event,
          pickupOtp === undefined ? base : { ...base, pickupOtp },
        );
        const riderPush = RIDER_PUSH_MESSAGES[event];
        if (riderPush) {
          void this.notifyBackgroundUser(riderUserId, {
            ...riderPush,
            channelId: 'ride-updates',
            data: { type: event, rideId: ride.id, rideVersion: ride.version },
          });
        }
      }
      if (ride.driverId) {
        const driverUserId = await this.lookups.getUserIdForDriver(ride.driverId);
        if (driverUserId) {
          this.publisher.publishToUser(driverUserId, event, base);
          if (event === 'ride.early_drop.requested') {
            void this.notifyBackgroundUser(driverUserId, {
              title: 'Rider wants to end the trip',
              body: 'Your rider asked to be dropped early. Open Cabzone to confirm or decline.',
              channelId: 'ride-offers',
              data: { type: event, rideId: ride.id, rideVersion: ride.version },
            });
          }
          if (event === 'ride.payment.cash_claimed') {
            void this.notifyBackgroundUser(driverUserId, {
              title: 'Confirm cash payment',
              body: 'Passenger marked the trip paid in cash. Open Cabzone to confirm or report unpaid.',
              channelId: 'ride-updates',
              data: { type: event, rideId: ride.id, rideVersion: ride.version },
            });
          }
          if (event === 'ride.driver.assigned' && shared['viaCounter']) {
            void this.notifyBackgroundUser(driverUserId, {
              title: 'Ride confirmed',
              body: 'The rider accepted. Head to the pickup point.',
              channelId: 'ride-offers',
              data: { type: event, rideId: ride.id, rideVersion: ride.version },
            });
          }
        }
      }
      if (event === 'ride.fare.raised') {
        const candidates = await this.findCandidates.execute(ride);
        for (const driver of candidates) {
          this.publisher.publishToUser(driver.userId, event, base);
        }
      }
      if (
        event === 'ride.driver.assigned' ||
        event === 'ride.offer.expired' ||
        event === 'ride.cancelled'
      ) {
        const recipients = (await this.offerRecipients?.take(ride.id)) ?? [];
        const winnerUserId = ride.driverId
          ? await this.lookups.getUserIdForDriver(ride.driverId)
          : null;
        for (const userId of recipients) {
          if (userId === winnerUserId) continue;
          this.publisher.publishToUser(
            userId,
            event === 'ride.driver.assigned' ? 'ride.offer.taken' : event,
            {
              rideId: ride.id,
              rideVersion: ride.version,
              reason:
                event === 'ride.driver.assigned'
                  ? 'TAKEN'
                  : event === 'ride.offer.expired'
                    ? 'EXPIRED'
                    : 'CANCELLED',
            },
          );
        }
      }
    } catch (err) {
      logger.warn({ rideId: ride.id, event, err: String(err) }, 'ride notification failed');
    }
  }

  async fareNegotiation(
    ride: RideEntity,
    event: 'ride.fare.countered' | 'ride.fare.counter_rejected',
    payload: {
      driverId: string;
      proposedFarePaise: number;
      driverName?: string | null | undefined;
      vehicleLabel?: string | null | undefined;
    },
  ): Promise<void> {
    try {
      const body = { rideId: ride.id, rideVersion: ride.version, status: ride.status, ...payload };
      const userId =
        event === 'ride.fare.countered'
          ? await this.lookups.getUserIdForRider(ride.bookerRiderId)
          : await this.lookups.getUserIdForDriver(payload.driverId);
      if (userId) {
        this.publisher.publishToUser(userId, event, body);
        if (event === 'ride.fare.countered') {
          const rupees = Math.round(payload.proposedFarePaise / 100);
          void this.notifyBackgroundUser(userId, {
            title: `₹${rupees} counter-offer`,
            body: 'A driver proposed a fare. Open Cabzone to accept or decline.',
            channelId: 'ride-updates',
            data: { type: event, rideId: ride.id, rideVersion: ride.version },
            expiresAt: ride.offeringExpiresAt,
          });
        }
      }
    } catch (err) {
      logger.warn({ rideId: ride.id, event, err: String(err) }, 'fare negotiation notification failed');
    }
  }

  /** Streams the driver's position to the rider while a ride is in progress. */
  async driverLocationUpdated(
    driverId: string,
    location: { lat: number; lng: number; heading: number | null; speedMps: number | null },
  ): Promise<void> {
    try {
      const [active] = await this.rideRepo.list({
        driverId,
        statuses: ACTIVE_RIDE_STATUSES,
        limit: 1,
        offset: 0,
      });
      if (!active) return;
      const riderUserId = await this.lookups.getUserIdForRider(active.bookerRiderId);
      if (riderUserId) {
        this.publisher.publishToUser(riderUserId, 'driver.location.updated', {
          rideId: active.id,
          ...location,
        });
      }
    } catch (err) {
      logger.warn({ driverId, err: String(err) }, 'driver location fan-out failed');
    }
  }
}
