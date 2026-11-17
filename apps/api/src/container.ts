import { env, isProdLike, walletMoneyEnabled } from '@/config/env.js';
import { TrustScoreService } from '@/modules/identity/application/trustScore.service.js';
import { MongoUnitOfWork } from '@/shared/db/unitOfWork.js';
import { buildHealthContainer } from '@/modules/health/health.container.js';
import {
  buildIdentityContainer,
  type IdentityContainer,
} from '@/modules/identity/identity.container.js';
import {
  buildPricingContainer,
  MongoPricingConfigRepository,
  type PricingContainer,
} from '@/modules/pricing/index.js';
import {
  canDriverGoOnline,
  canUserAuthenticate,
  DriverModel,
  isVehicleApproved,
  MongoDriverRepository,
  MongoDriverDocumentRepository,
  MongoRiderRepository,
  MongoUserRepository,
  MongoVehicleRepository,
  UserModel,
  VehicleModel,
} from '@/modules/identity/index.js';
import {
  buildDispatchContainer,
  type DispatchContainer,
} from '@/modules/dispatch/dispatch.container.js';
import { ACTIVE_RIDE_STATUSES } from '@/modules/dispatch/application/useCases/driverOfferEligibility.js';
import { RedisPresenceRepository } from '@/modules/dispatch/infrastructure/redisPresence.repository.js';
import { DEFAULT_DISPATCH_CONFIG } from '@/modules/dispatch/application/dispatch.types.js';
import { RedisOfferRecipientsRepository } from '@/modules/dispatch/infrastructure/offerRecipients.repository.js';
import { MongoPushTokenRepository } from '@/modules/dispatch/infrastructure/pushToken.repository.js';
import { MongoPushReceiptRepository } from '@/modules/dispatch/infrastructure/pushReceipt.repository.js';
import { MongoPaymentRepository, MongoWalletRepository } from '@/modules/ledger/index.js';
import { buildLedgerContainer, type LedgerContainer } from '@/modules/ledger/ledger.container.js';
import { RazorpayGateway } from '@/modules/rides/infrastructure/razorpay.adapter.js';
import { RazorpayXPayoutGateway } from '@/modules/ledger/infrastructure/razorpayPayout.adapter.js';
import {
  MongoRideEventRepository,
  MongoRideRepository,
  MongoRideReviewRepository,
} from '@/modules/rides/index.js';
import { buildRidesContainer, type RidesContainer } from '@/modules/rides/rides.container.js';
import { getRedis } from '@/shared/queue/redis.js';
import { getRealtimeHub } from '@/shared/realtime/index.js';
import { buildZoneContainer, type ZoneContainer } from '@/modules/zone/zone.container.js';
import { buildRoutingContainer, type RoutingContainer } from '@/modules/routing/index.js';
import { RIDE_CALL_RATE_LIMIT_PER_MIN, RIDE_CHAT_RATE_LIMIT_PER_MIN } from '@cabzone/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { MongoRideChatRepository } from '@/modules/rides/infrastructure/persistence/mongoRideChat.repository.js';
import { MongoRideCallRepository } from '@/modules/rides/infrastructure/persistence/mongoRideCall.repository.js';
import { MongoRateLimitStore } from '@/shared/http/rateLimit.js';
import { isDriverEligibleForRide } from '@/modules/identity/domain/driverRideEligibility.js';

export interface AppContainers {
  health: ReturnType<typeof buildHealthContainer>;
  identity: IdentityContainer;
  zone: ZoneContainer;
  routing: RoutingContainer;
  pricing: PricingContainer;
  rides: RidesContainer;
  ledger: LedgerContainer;
  dispatch: DispatchContainer;
}
export function buildContainers(overrides?: Partial<AppContainers>): AppContainers {
  const unitOfWork = new MongoUnitOfWork();
  const riderRepo = new MongoRiderRepository();
  const userRepo = new MongoUserRepository();
  const driverRepo = new MongoDriverRepository();
  const vehicleRepo = new MongoVehicleRepository();
  const documentRepo = new MongoDriverDocumentRepository();
  const rideRepo = new MongoRideRepository();
  const walletRepo = new MongoWalletRepository();
  // One trust score service for the whole API. Ride writes that can change a score schedule a refresh.
  const trustScore = new TrustScoreService({ riderRepo, driverRepo, rideRepo, mode: env.TRUST_SCORE_V2 });
  rideRepo.onTerminalTransition = (ride) => {
    trustScore.schedule('RIDER', ride.bookerRiderId);
    if (ride.driverId) trustScore.schedule('DRIVER', ride.driverId);
  };
  const presenceRepo = new RedisPresenceRepository(getRedis, 120, isProdLike);

  const health = overrides?.health ?? buildHealthContainer();
  const routing = overrides?.routing ?? buildRoutingContainer();
  const zone =
    overrides?.zone ??
    buildZoneContainer({
      destinationStateResolver: routing.resolveDestinationStateUseCase,
    });
  const ensureDevDriverWallet = async (driverId: string) => {
    const now = new Date();
    let wallet = await walletRepo.findByDriverId(driverId);
    if (!wallet) {
      wallet = {
        id: crypto.randomUUID(),
        ownerType: 'DRIVER',
        driverId,
        riderId: null,
        balancePaise: 0,
        owedPaise: 0,
        status: 'ACTIVE',
        version: 0,
        createdAt: now,
        updatedAt: now,
      };
    }
    if (wallet.balancePaise < 5000) {
      const topUpPaise = 50000 - wallet.balancePaise;
      await walletRepo.recordTransaction({
        id: crypto.randomUUID(),
        walletId: wallet.id,
        ownerType: 'DRIVER',
        driverId,
        riderId: null,
        type: 'CREDIT',
        amountPaise: topUpPaise,
        referenceType: 'WALLET_RECHARGE',
        referenceId: null,
        idempotencyKey: `dev_seed_wallet_${driverId}_${now.getTime()}`,
        balanceBeforePaise: wallet.balancePaise,
        balanceAfterPaise: 50000,
        createdBy: driverId,
        note: 'Dev test-approve starter wallet recharge (₹500)',
        createdAt: now,
      });
      await walletRepo.save({
        ...wallet,
        status: 'ACTIVE',
        balancePaise: 50000,
        version: wallet.version + 1,
        updatedAt: now,
      });
    }
  };

  const dispatchRef: { current?: DispatchContainer } = {};
  const ridesRef: { current?: RidesContainer } = {};

  const identity =
    overrides?.identity ??
    buildIdentityContainer({
      trustScore,
      unitOfWork,
      riderRepo,
      driverRepo,
      documentRepo,
      vehicleRepo,
      rideRepo,
      zoneRepo: zone.zoneRepo,
      ensureDriverWallet: ensureDevDriverWallet,
      hasActiveRide: async (driverId: string) => {
        const active = await rideRepo.list({
          driverId,
          statuses: ACTIVE_RIDE_STATUSES,
          limit: 1,
          offset: 0,
        });
        return active.length > 0;
      },
      removeDriverPresence: async (driverId: string) => {
        await (dispatchRef.current?.presence ?? presenceRepo).remove(driverId);
        const driver = await driverRepo.findById(driverId);
        if (driver) {
          await ridesRef.current?.rideCalls.endForUser(driver.userId, 'access_revoked');
        }
      },
      onSessionRevoked: async (session) => {
        await dispatchRef.current?.push.unregister(session.userId, session.deviceId);
        await ridesRef.current?.rideCalls.endForInstallation(
          session.userId,
          session.deviceId,
          'logout',
        );
      },
      onAccountSuspended: async (userId: string) => {
        await ridesRef.current?.rideCalls.endForUser(userId, 'access_revoked');
      },
      notifyDriver: async (notification) => {
        getRealtimeHub().publishToUser(
          notification.userId,
          notification.event,
          notification.payload,
        );
        await dispatchRef.current?.push.notify([notification.userId], {
          title: notification.title,
          body: notification.body,
          data: { event: notification.event, ...notification.payload },
        });
      },
    });
  const pricing =
    overrides?.pricing ??
    buildPricingContainer({
      unitOfWork,
      pricingConfigRepo: new MongoPricingConfigRepository(),
      walletRepo,
      resolveRiderIdFromAuthHeader: async (authHeader) => {
        if (!authHeader?.startsWith('Bearer ') || !identity.verifyToken) return null;
        try {
          const auth = await identity.verifyToken(authHeader.slice(7).trim());
          if (auth.role !== 'RIDER') return null;
          return (await riderRepo.findByUserId(auth.userId))?.id ?? null;
        } catch {
          return null;
        }
      },
      serviceClassificationUseCase: zone.serviceClassificationUseCase,
      tokenSecret: env.JWT_ACCESS_SECRET,
      routingUseCase: routing.getRouteUseCase,
    });

  const resolveDriverId = async (userId: string) =>
    (await driverRepo.findByUserId(userId))?.id ?? null;
  const ledger =
    overrides?.ledger ??
    buildLedgerContainer({
      walletPaymentGateway: new RazorpayGateway(
        env.RAZORPAY_KEY_ID ?? '',
        env.RAZORPAY_KEY_SECRET ?? '',
        walletMoneyEnabled,
        env.RAZORPAY_MODE,
      ),
      walletPayoutGateway:
        walletMoneyEnabled && env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAYX_ACCOUNT_NUMBER
          ? new RazorpayXPayoutGateway(
              env.RAZORPAY_KEY_ID,
              env.RAZORPAY_KEY_SECRET,
              env.RAZORPAYX_ACCOUNT_NUMBER,
            )
          : undefined,
      driverContact: async (driverId) => {
        const driver = await driverRepo.findById(driverId);
        if (!driver) return null;
        const user = await UserModel.findById(driver.userId).lean();
        return {
          name: driver.name ?? 'Cabzone driver',
          phone: user?.phone_e164 ?? null,
        };
      },
      unitOfWork,
      walletRepo,
      resolveDriverId,
      lookups: {
        getDrivers: async () => {
          const drivers = await DriverModel.find().lean();
          const userIds = drivers.map((d) => d.user_id);
          const vehicleIds = drivers.map((d) => d.current_vehicle_id).filter(Boolean);
          const [users, vehicles] = await Promise.all([
            UserModel.find({ _id: { $in: userIds } }).lean(),
            VehicleModel.find({ _id: { $in: vehicleIds } }).lean(),
          ]);
          const userMap = new Map(users.map((u) => [u._id, u]));
          const vehicleMap = new Map(vehicles.map((v) => [v._id, v]));

          return drivers.map((d) => {
            const u = userMap.get(d.user_id);
            const v = d.current_vehicle_id ? vehicleMap.get(d.current_vehicle_id) : null;
            let name = d.name || 'Driver';
            if (u?.phone_e164 === '+919000000002' && (!d.name || d.name === 'Verified Driver'))
              name = 'Dev Driver';
            else if (u?.phone_e164 === '+919000000012' && !d.name) name = 'Subrata Ghosh';
            else if (u?.phone_e164 === '+919000000013' && !d.name) name = 'Rajesh Barman';
            else if (!d.name) name = `Driver #${d._id.slice(0, 6)}`;

            const vCat = v?.vehicle_type ? `[${v.vehicle_type}] ` : '';
            return {
              id: d._id,
              name,
              phoneE164: u?.phone_e164 ?? '',
              vehicleNumber: v?.registration_number
                ? `${vCat}${v.registration_number}`
                : (v?.vehicle_type ?? null),
              zoneName: 'Siliguri City',
            };
          });
        },
        getRiders: async () => {
          const res = await riderRepo.list({ limit: 500, offset: 0 });
          return res.items.map((item) => ({
            id: item.rider.id,
            name: item.rider.name,
            phoneE164: item.phoneE164,
            email: item.rider.email,
          }));
        },
      },
    });

  const isDevRuntime = !isProdLike && process.env['NODE_ENV'] !== 'test';

  const dispatch =
    overrides?.dispatch ??
    buildDispatchContainer({
      presence: presenceRepo,
      offerRecipients: new RedisOfferRecipientsRepository(getRedis),
      pushTokens: new MongoPushTokenRepository(),
      pushReceipts: new MongoPushReceiptRepository(),
      publisher: getRealtimeHub(),
      rideRepo,
      walletRepo: ledger.walletRepo,
      isDevMode: isDevRuntime,
      lookups: {
        getRiderTrustTier: async (riderIds) => {
          const tiers = await trustScore.getPublicTiers('RIDER', riderIds);
          return new Map([...tiers].map(([id, t]) => [id, t.tier]));
        },
        getDriverProfileByUserId: async (userId) => {
          const driver = await driverRepo.findByUserId(userId);
          if (!driver) return null;
          if (isDevRuntime) {
            const existingWallet = await walletRepo.findByDriverId(driver.id);
            if (!existingWallet) {
              await ensureDevDriverWallet(driver.id);
            }
          }
          const [vehicle, documents] = await Promise.all([
            driver.currentVehicleId ? vehicleRepo.findById(driver.currentVehicleId) : null,
            documentRepo.findByDriverId(driver.id),
          ]);
          const eligibility = canDriverGoOnline(driver, { vehicle, documents });
          return {
            driverId: driver.id,
            userId: driver.userId,
            eligibleToGoOnline: eligibility.eligible,
            ineligibleReason: eligibility.reason,
            vehicleCategory: vehicle && isVehicleApproved(vehicle) ? vehicle.vehicleType : null,
          };
        },
        getUserIdForRider: async (riderId) => (await riderRepo.findById(riderId))?.userId ?? null,
        isPointInCityZones: async (lat, lng, cityZoneIds) => {
          if (cityZoneIds.length === 0) return false;
          const containing = await zone.zoneRepo.findActiveCitiesContainingPoint({ lat, lng });
          return containing.some((z) => cityZoneIds.includes(z.id));
        },
        getUserIdForDriver: async (driverId) =>
          (await driverRepo.findById(driverId))?.userId ?? null,
        getDriverInfo: async (driverId) => {
          const driver = await driverRepo.findById(driverId);
          if (!driver) return null;
          const user = await userRepo.findById(driver.userId);
          const vehicle = driver.currentVehicleId
            ? await vehicleRepo.findById(driver.currentVehicleId)
            : null;
          return {
            name: driver.name?.trim() || `Driver #${driver.id.slice(0, 6)}`,
            phoneE164: user?.phoneE164 ?? '',
            registrationNumber: vehicle?.registrationNumber ?? undefined,
          };
        },
      },
    });
  dispatchRef.current = dispatch;

  const chatRateLimiter = new MongoRateLimitStore();
  const rides =
    overrides?.rides ??
    buildRidesContainer({
      chatMessages: new MongoRideChatRepository(),
      consumeChatRateLimit: (userId) =>
        chatRateLimiter.consume(`ride-chat:${userId}`, RIDE_CHAT_RATE_LIMIT_PER_MIN, 60_000),
      driverLocation: env.RIDE_GEOFENCE_ENABLED ? presenceRepo : undefined,
      notifyChat: (ride, message) => dispatch.notifier.chatMessage(ride, message),
      callRecords: new MongoRideCallRepository(),
      getUserIdForRider: async (riderId) => (await riderRepo.findById(riderId))?.userId ?? null,
      getUserIdForDriver: async (driverId) => (await driverRepo.findById(driverId))?.userId ?? null,
      getCallerDisplayName: async (ride, callerRole) => {
        if (callerRole === 'RIDER') {
          return ride.passenger.name?.trim() || 'Your rider';
        }
        const driver = ride.driverId ? await driverRepo.findById(ride.driverId) : null;
        return driver?.name?.trim() || 'Your driver';
      },
      isInstallationRegistered: (userId, installationId) =>
        dispatch.push.hasInstallation(userId, installationId),
      consumeCallRateLimit: (userId) =>
        chatRateLimiter.consume(`ride-calls:${userId}`, RIDE_CALL_RATE_LIMIT_PER_MIN, 60_000),
      notifyCall: async (userId, event, call, callerName) => {
        const isActive =
          call.state === 'RINGING' || call.state === 'ACCEPTED' || call.state === 'CONNECTED';
        const type =
          event === 'incoming'
            ? 'ride.call.incoming'
            : isActive
              ? 'ride.call.updated'
              : 'ride.call.ended';
        const data = {
          type,
          callId: call.id,
          rideId: call.rideId,
          state: call.state,
          callerRole: call.callerRole,
          ...(callerName ? { callerName } : {}),
          ...(call.connectedAt ? { connectedAt: call.connectedAt } : {}),
          ...(event === 'incoming' ? { expiresAt: call.ringingUntil } : {}),
        };
        getRealtimeHub().publishToUser(userId, type, data);
        if (event === 'incoming' || !isActive) {
          await dispatch.push.notify([userId], {
            title:
              event === 'incoming'
                ? `Incoming ride call${callerName ? ` · ${callerName}` : ''}`
                : 'Ride call ended',
            body:
              event === 'incoming'
                ? 'Tap to answer privately in Cabzone.'
                : 'Your private ride call has ended.',
            channelId: event === 'incoming' ? 'ride-calls-ring' : 'ride-calls',
            data,
            expiresAt:
              event === 'incoming'
                ? new Date(call.ringingUntil)
                : new Date(Date.now() + 30_000),
          });
        }
      },
      isCommunicationAccountActive: async (userId, role) => {
        const user = await userRepo.findById(userId);
        if (!user || !canUserAuthenticate(user)) return false;
        if (role === 'DRIVER') {
          const driver = await driverRepo.findByUserId(userId);
          return driver?.status === 'ACTIVE';
        }
        return true;
      },
      extensions: {
        routing: routing.getRouteUseCase,
        getDriverLocation: async (driverId) => {
          const location = await dispatch.presence.get(driverId);
          return location
            ? { lat: location.lat, lng: location.lng, updatedAt: location.locationUpdatedAt }
            : null;
        },
        classify: async (pickup, drop, vehicleCategory) => {
          const result = await zone.serviceClassificationUseCase.execute({
            pickup,
            drop,
            vehicleCategory,
          });
          return {
            classification: result.type,
            cityZoneId: result.cityZoneId,
            destinationStateCode: result.destinationStateCode ?? null,
            routeScope: result.routeScope ?? null,
          };
        },
      },
      unitOfWork,
      rideRepo,
      rideEventRepo: new MongoRideEventRepository(),
      rideReviewRepo: new MongoRideReviewRepository(),
      paymentRepo: new MongoPaymentRepository(),
      applyRevealedProfileRating: async (targetRole, targetId, stars) => {
        // Single atomic update per repository (sum and count together, average derived).
        const repo = targetRole === 'DRIVER' ? driverRepo : riderRepo;
        if (!repo.applyRevealedRating) {
          throw new Error('applyRevealedRating is required to record ratings.');
        }
        await repo.applyRevealedRating(targetId, stars);
        // The score depends on ratings; refresh it once the surrounding transaction has committed.
        trustScore.schedule(targetRole === 'DRIVER' ? 'DRIVER' : 'RIDER', targetId);
      },
      walletRepo: ledger.walletRepo,
      pricingConfigRepo: pricing.pricingConfigRepo,
      tokenSecret: env.JWT_ACCESS_SECRET,
      resolveRiderId: async (userId) => (await riderRepo.findByUserId(userId))?.id ?? null,
      resolveDriverId,
      resolveAssignedDriver: async (driverId, vehicleId, includeContact) => {
        const driver = await driverRepo.findById(driverId);
        if (!driver) return null;
        const contactUser = includeContact ? await userRepo.findById(driver.userId) : null;
        const targetVehicleId = vehicleId ?? driver.currentVehicleId;
        const vehicle = targetVehicleId ? await vehicleRepo.findById(targetVehicleId) : null;
        const name = driver.name?.trim() || 'Cabzone Driver';
        return {
          driverId: driver.id,
          name,
          ...(contactUser?.phoneE164 ? { phoneE164: contactUser.phoneE164 } : {}),
          profilePhotoUrl: driver.profilePhotoUrl ?? null,
          ratingAverage: driver.ratingCount > 0 ? driver.ratingAverage : null,
          ratingCount: driver.ratingCount,
          trustTier:
            driver.trustBreakdown?.isPublic && driver.trustBreakdown.tier !== 'UNRATED'
              ? driver.trustBreakdown.tier
              : null,
          vehicle: vehicle
            ? {
                vehicleId: vehicle.id,
                make: vehicle.make,
                model: vehicle.model,
                color: vehicle.color ?? '',
                registrationNumber: vehicle.registrationNumber,
                vehicleCategory: vehicle.vehicleType,
              }
            : null,
        };
      },
      notifier: dispatch.notifier,
      pickupOtpSecret: env.JWT_ACCESS_SECRET,
      requireDriverEligibility: async (driverId, ride) => {
        const driver = await driverRepo.findById(driverId);
        if (!driver) throw AppError.forbidden('DRIVER_INELIGIBLE: Driver is unavailable.');
        const user = await userRepo.findById(driver.userId);
        const vehicle = driver.currentVehicleId
          ? await vehicleRepo.findById(driver.currentVehicleId)
          : null;
        const documents = await documentRepo.findByDriverId(driverId);
        let presence = await dispatch.presence.get(driverId);
        const now = new Date();
        if (isDevRuntime && !presence && vehicle) {
          presence = {
            driverId: driver.id,
            userId: driver.userId,
            vehicleCategory: vehicle.vehicleType,
            lat: ride.pickup.lat,
            lng: ride.pickup.lng,
            heading: null,
            speedMps: null,
            locationUpdatedAt: now,
          };
          await dispatch.presence.set(presence);
        }
        const docsValid =
          isDevRuntime ||
          isDriverEligibleForRide(driver, user, vehicle, documents, ride.vehicleCategory, now);
        const basicEligible =
          canDriverGoOnline(driver, isDevRuntime ? undefined : { vehicle, documents, now })
            .eligible &&
          user !== null &&
          vehicle !== null &&
          isVehicleApproved(vehicle) &&
          (isDevRuntime || vehicle.vehicleType === ride.vehicleCategory);
        if (
          !docsValid ||
          !basicEligible ||
          !presence ||
          presence.userId !== driver.userId ||
          (!isDevRuntime && presence.vehicleCategory !== ride.vehicleCategory) ||
          (!isDevRuntime &&
            now.getTime() - presence.locationUpdatedAt.getTime() >
              DEFAULT_DISPATCH_CONFIG.locationMaxAgeMs) ||
          presence.locationUpdatedAt > now
        ) {
          throw AppError.forbidden(
            'DRIVER_INELIGIBLE: Driver must be verified, online and available with valid documents and a matching vehicle.',
          );
        }
        return vehicle!.id;
      },
    });
  ridesRef.current = rides;

  return {
    health,
    identity,
    zone,
    routing,
    pricing,
    rides,
    ledger,
    dispatch,
  };
}
