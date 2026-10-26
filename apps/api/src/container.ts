import { env, isProdLike } from '@/config/env.js';
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
import { RedisPresenceRepository } from '@/modules/dispatch/infrastructure/redisPresence.repository.js';
import { DEFAULT_DISPATCH_CONFIG } from '@/modules/dispatch/application/dispatch.types.js';
import { RedisOfferRecipientsRepository } from '@/modules/dispatch/infrastructure/offerRecipients.repository.js';
import { MongoPushTokenRepository } from '@/modules/dispatch/infrastructure/pushToken.repository.js';
import { MongoPushReceiptRepository } from '@/modules/dispatch/infrastructure/pushReceipt.repository.js';
import { MongoWalletRepository } from '@/modules/ledger/index.js';
import { buildLedgerContainer, type LedgerContainer } from '@/modules/ledger/ledger.container.js';
import { RazorpayGateway } from '@/modules/rides/infrastructure/razorpay.adapter.js';
import { MongoRideEventRepository, MongoRideRepository } from '@/modules/rides/index.js';
import { buildRidesContainer, type RidesContainer } from '@/modules/rides/rides.container.js';
import { getRedis } from '@/shared/queue/redis.js';
import { getRealtimeHub } from '@/shared/realtime/index.js';
import { buildZoneContainer, type ZoneContainer } from '@/modules/zone/zone.container.js';
import { buildRoutingContainer, type RoutingContainer } from '@/modules/routing/index.js';
import { AppError } from '@/shared/errors/AppError.js';
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
    if (wallet.balancePaise <= 0) {
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

  const identity =
    overrides?.identity ??
    buildIdentityContainer({
      riderRepo,
      driverRepo,
      vehicleRepo,
      rideRepo,
      zoneRepo: zone.zoneRepo,
      ensureDriverWallet: ensureDevDriverWallet,
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
      walletPaymentGateway: new RazorpayGateway(env.RAZORPAY_KEY_ID ?? '', env.RAZORPAY_KEY_SECRET ?? '', !isProdLike && env.RAZORPAY_MODE === 'test'),
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
            else if (!d.name && u) name = `Driver (${u.phone_e164.slice(-4)})`;

            const vCat = v?.vehicle_type ? `[${v.vehicle_type}] ` : '';
            return {
              id: d._id,
              name,
              phoneE164: u?.phone_e164 ?? '',
              vehicleNumber: v?.registration_number ? `${vCat}${v.registration_number}` : v?.vehicle_type ?? null,
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
      presence: new RedisPresenceRepository(getRedis, 120, isProdLike),
      offerRecipients: new RedisOfferRecipientsRepository(getRedis),
      pushTokens: new MongoPushTokenRepository(),
      pushReceipts: new MongoPushReceiptRepository(),
      publisher: getRealtimeHub(),
      rideRepo,
      walletRepo: ledger.walletRepo,
      isDevMode: isDevRuntime,
      lookups: {
        getDriverProfileByUserId: async (userId) => {
          const driver = await driverRepo.findByUserId(userId);
          if (!driver) return null;
          if (isDevRuntime) {
            const existingWallet = await walletRepo.findByDriverId(driver.id);
            if (!existingWallet) {
              await ensureDevDriverWallet(driver.id);
            }
          }
          const vehicle = driver.currentVehicleId
            ? await vehicleRepo.findById(driver.currentVehicleId)
            : null;
          const eligibility = canDriverGoOnline(driver);
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
            name: driver.name || (user ? `Driver (${user.phoneE164.slice(-4)})` : 'Driver'),
            phoneE164: user?.phoneE164 ?? '',
            registrationNumber: vehicle?.registrationNumber ?? undefined,
          };
        },
      },
    });

  const rides =
    overrides?.rides ??
    buildRidesContainer({
      unitOfWork,
      rideRepo,
      rideEventRepo: new MongoRideEventRepository(),
      walletRepo: ledger.walletRepo,
      pricingConfigRepo: pricing.pricingConfigRepo,
      tokenSecret: env.JWT_ACCESS_SECRET,
      resolveRiderId: async (userId) => (await riderRepo.findByUserId(userId))?.id ?? null,
      resolveDriverId,
      resolveAssignedDriver: async (driverId, vehicleId) => {
        const driver = await driverRepo.findById(driverId);
        if (!driver) return null;
        const targetVehicleId = vehicleId ?? driver.currentVehicleId;
        const [user, vehicle] = await Promise.all([
          userRepo.findById(driver.userId),
          targetVehicleId ? vehicleRepo.findById(targetVehicleId) : Promise.resolve(null),
        ]);
        const name =
          driver.name?.trim() || (user ? `Driver (${user.phoneE164.slice(-4)})` : 'Cabzone Driver');
        return {
          driverId: driver.id,
          name,
          phoneE164: user?.phoneE164 ?? '',
          profilePhotoUrl: driver.profilePhotoUrl ?? null,
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
          canDriverGoOnline(driver).eligible &&
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
