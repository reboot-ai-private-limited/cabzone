import type { RideEntity } from '../../../rides/rides.public.js';
import type { DriverPresencePort, NearbyDriver } from '../../domain/presence.port.js';
import type { DispatchConfig } from '../dispatch.types.js';
import type { DriverOfferEligibility } from './driverOfferEligibility.js';

/** Deterministic ranking (dispatch-engine.md §6): closest fresh, eligible driver first. */
export class FindCandidateDriversUseCase {
  constructor(
    private readonly presence: DriverPresencePort,
    private readonly eligibility: DriverOfferEligibility,
    private readonly config: DispatchConfig,
  ) {}

  async execute(ride: RideEntity): Promise<NearbyDriver[]> {
    // Over-fetch: some nearby drivers will be busy or out of balance.
    const nearby = await this.presence.findNearby({
      lat: ride.pickup.lat,
      lng: ride.pickup.lng,
      radiusM: this.config.offerRadiusM,
      vehicleCategory: ride.vehicleCategory,
      maxAgeMs: this.config.locationMaxAgeMs,
      limit: this.config.maxCandidates * 3,
    });

    const candidates: NearbyDriver[] = [];
    for (const driver of nearby) {
      if (candidates.length >= this.config.maxCandidates) break;
      if (await this.eligibility.canReceiveOffers(driver.driverId)) candidates.push(driver);
    }
    return candidates;
  }
}
