import { env } from '@/config/env.js';
import { buildHealthContainer } from '@/modules/health/health.container.js';
import { buildIdentityContainer, type IdentityContainer } from '@/modules/identity/identity.container.js';
import {
  buildPricingContainer,
  MongoPricingConfigRepository,
  type PricingContainer,
} from '@/modules/pricing/index.js';
import {
  canDriverGoOnline,
  isVehicleApproved,
  MongoDriverRepository,
  MongoRiderRepository,
  MongoUserRepository,
  MongoVehicleRepository,
} from '@/modules/identity/index.js';
import { buildDispatchContainer, type DispatchContainer } from '@/modules/dispatch/dispatch.container.js';
import { RedisPresenceRepository } from '@/modules/dispatch/infrastructure/redisPresence.repository.js';
import { MongoWalletRepository } from '@/modules/ledger/index.js';
import { buildLedgerContainer, type LedgerContainer } from '@/modules/ledger/ledger.container.js';
import { MongoRideEventRepository, MongoRideRepository } from '@/modules/rides/index.js';
import { buildRidesContainer, type RidesContainer } from '@/modules/rides/rides.container.js';
import { getRedis } from '@/shared/queue/redis.js';
import { getRealtimeHub } from '@/shared/realtime/index.js';
import { buildZoneContainer, type ZoneContainer } from '@/modules/zone/zone.container.js';
import { buildRoutingContainer, type RoutingContainer } from '@/modules/routing/index.js';

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
  const riderRepo = new MongoRiderRepository();
  const userRepo = new MongoUserRepository();
  const driverRepo = new MongoDriverRepository();
  const vehicleRepo = new MongoVehicleRepository();
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
      pricingConfigRepo: new MongoPricingConfigRepository(),
      serviceClassificationUseCase: zone.serviceClassificationUseCase,
      tokenSecret: env.JWT_ACCESS_SECRET,
      routingUseCase: routing.getRouteUseCase,
    });

  const resolveDriverId = async (userId: string) =>
    (await driverRepo.findByUserId(userId))?.id ?? null;
  const ledger =
    overrides?.ledger ??
    buildLedgerContainer({ walletRepo: new MongoWalletRepository(), resolveDriverId });
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
        getUserIdForDriver: async (driverId) => (await driverRepo.findById(driverId))?.userId ?? null,
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
      rideRepo,
      rideEventRepo: new MongoRideEventRepository(),
      walletRepo: ledger.walletRepo,
      pricingConfigRepo: pricing.pricingConfigRepo,
      tokenSecret: env.JWT_ACCESS_SECRET,
      resolveRiderId: async (userId) => (await riderRepo.findByUserId(userId))?.id ?? null,
      resolveDriverId,
      notifier: dispatch.notifier,
      pickupOtpSecret: env.JWT_ACCESS_SECRET,
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
