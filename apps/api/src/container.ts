import { env } from '@/config/env.js';
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
import { MongoWalletRepository } from '@/modules/ledger/index.js';
import { buildLedgerContainer, type LedgerContainer } from '@/modules/ledger/ledger.container.js';
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

  const health = overrides?.health ?? buildHealthContainer();
  const routing = overrides?.routing ?? buildRoutingContainer();
  const zone =
    overrides?.zone ??
    buildZoneContainer({
      destinationStateResolver: routing.resolveDestinationStateUseCase,
    });
  const identity =
    overrides?.identity ??
    buildIdentityContainer({
      riderRepo,
      driverRepo,
      vehicleRepo,
      rideRepo,
      zoneRepo: zone.zoneRepo,
    });
  const pricing =
    overrides?.pricing ??
    buildPricingContainer({
      unitOfWork,
      pricingConfigRepo: new MongoPricingConfigRepository(),
      serviceClassificationUseCase: zone.serviceClassificationUseCase,
      tokenSecret: env.JWT_ACCESS_SECRET,
      routingUseCase: routing.getRouteUseCase,
    });

  const resolveDriverId = async (userId: string) =>
    (await driverRepo.findByUserId(userId))?.id ?? null;
  const ledger =
    overrides?.ledger ??
    buildLedgerContainer({
      unitOfWork,
      walletRepo: new MongoWalletRepository(),
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
            let name = 'Driver';
            if (u?.phone_e164 === '+919000000002') name = 'Dev Driver';
            else if (u?.phone_e164 === '+919000000012') name = 'Subrata Ghosh';
            else if (u?.phone_e164 === '+919000000013') name = 'Rajesh Barman';
            else if (u) name = `Driver (${u.phone_e164.slice(-4)})`;

            return {
              id: d._id,
              name,
              phoneE164: u?.phone_e164 ?? '',
              vehicleNumber: v?.registration_number ?? null,
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

  const dispatch =
    overrides?.dispatch ??
    buildDispatchContainer({
      presence: new RedisPresenceRepository(getRedis),
      publisher: getRealtimeHub(),
      rideRepo,
      walletRepo: ledger.walletRepo,
      lookups: {
        getDriverProfileByUserId: async (userId) => {
          const driver = await driverRepo.findByUserId(userId);
          if (!driver) return null;
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
            name: user ? `Driver (${user.phoneE164.slice(-4)})` : 'Driver',
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
        const presence = await dispatch.presence.get(driverId);
        const now = new Date();
        if (
          !isDriverEligibleForRide(driver, user, vehicle, documents, ride.vehicleCategory, now) ||
          !presence ||
          presence.userId !== driver.userId ||
          presence.vehicleCategory !== ride.vehicleCategory ||
          now.getTime() - presence.locationUpdatedAt.getTime() >= 120_000 ||
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
