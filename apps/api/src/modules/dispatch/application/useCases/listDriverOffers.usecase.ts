import { calculateNegotiationBounds } from '@cabzone/contracts';
import { AppError } from '../../../../shared/errors/AppError.js';
import type { RideEntity, RideRepositoryPort } from '../../../rides/rides.public.js';
import { haversineDistanceM, type DriverPresencePort } from '../../domain/presence.port.js';
import type {
  DispatchConfig,
  DispatchLookups,
  RideOfferDto,
} from '../dispatch.types.js';
import type { DriverOfferEligibility } from './driverOfferEligibility.js';

export function toRideOffer(ride: RideEntity, distanceToPickupM: number): RideOfferDto {
  return {
    rideId: ride.id,
    vehicleCategory: ride.vehicleCategory,
    pickup: ride.pickup,
    drop: ride.drop,
    proposedFarePaise: ride.proposedFarePaise ?? ride.suggestedFarePaise,
    distanceToPickupM: Math.round(distanceToPickupM),
    expiresAt: (ride.offeringExpiresAt ?? new Date()).toISOString(),
    negotiation: calculateNegotiationBounds({
      suggestedFarePaise: ride.suggestedFarePaise,
      minimumFarePaise: ride.pricingSnapshot.minimumFarePaise,
      floorPercent: ride.pricingSnapshot.negotiationFloorPercent,
      ceilingPercent: ride.pricingSnapshot.negotiationCeilingPercent,
    }),
  };
}

/**
 * Pull-based view of open offers for a driver. This is also the resync path after a WebSocket
 * reconnect (websocket-contracts.md §9), so it must never depend on missed events.
 */
export class ListDriverOffersUseCase {
  constructor(
    private readonly presence: DriverPresencePort,
    private readonly rideRepo: RideRepositoryPort,
    private readonly eligibility: DriverOfferEligibility,
    private readonly lookups: DispatchLookups,
    private readonly config: DispatchConfig,
    private readonly isDevMode = false,
  ) {}

  async execute(userId: string, now: Date = new Date()): Promise<RideOfferDto[]> {
    const profile = await this.lookups.getDriverProfileByUserId(userId);
    if (!profile) {
      throw AppError.forbidden('DRIVER_PROFILE_REQUIRED: No driver profile for this account.');
    }
    let here = await this.presence.get(profile.driverId);

    // In dev mode, if the driver app is polling /v1/driver/offers while ONLINE, auto-heal presence at Siliguri default if missing
    if (!here && this.isDevMode && profile.eligibleToGoOnline && profile.vehicleCategory) {
      here = {
        driverId: profile.driverId,
        userId: profile.userId,
        vehicleCategory: profile.vehicleCategory,
        lat: 26.7271,
        lng: 88.4334,
        heading: null,
        speedMps: null,
        locationUpdatedAt: now,
      };
      await this.presence.set(here);
    }

    if (!here) return [];
    if (
      !this.isDevMode &&
      now.getTime() - here.locationUpdatedAt.getTime() > this.config.locationMaxAgeMs
    ) {
      return [];
    }
    if (!(await this.eligibility.canReceiveOffers(profile.driverId))) return [];

    const open = await this.rideRepo.list({
      statuses: ['OFFERING'],
      vehicleCategory: this.isDevMode ? undefined : here.vehicleCategory,
      offeringExpiresAfter: now,
      limit: 100,
      offset: 0,
    });

    const matched = open
      .filter((ride) => ride.vehicleCategory === here.vehicleCategory)
      .map((ride) => ({ ride, distance: haversineDistanceM(here, ride.pickup) }))
      .filter(({ distance }) => distance <= this.config.offerRadiusM)
      .sort((a, b) => a.distance - b.distance)
      .map(({ ride, distance }) => toRideOffer(ride, distance));

    if (matched.length > 0 || !this.isDevMode) {
      return matched;
    }

    // Dev fallback: if an active OFFERING ride exists in dev testing (even if created with a slightly different pin/category), surface it so simulation works out-of-the-box
    return open
      .map((ride) => ({ ride, distance: haversineDistanceM(here, ride.pickup) }))
      .sort((a, b) => a.distance - b.distance)
      .map(({ ride, distance }) => toRideOffer(ride, distance));
  }
}

