import { DRIVER_ON_TRIP_STATUSES, type RideStatus } from '@cabzone/contracts';
import { isDriverEligibleForNewRides, type WalletRepositoryPort } from '../../../ledger/ledger.public.js';
import type { RideRepositoryPort } from '../../../rides/rides.public.js';

export const ACTIVE_RIDE_STATUSES: readonly RideStatus[] = DRIVER_ON_TRIP_STATUSES;

/** Dispatch-time gates that are not about where the driver is: wallet balance and being free. */
export class DriverOfferEligibility {
  constructor(
    private readonly walletRepo: WalletRepositoryPort,
    private readonly rideRepo: RideRepositoryPort,
  ) {}

  async hasActiveRide(driverId: string): Promise<boolean> {
    const active = await this.rideRepo.list({
      driverId,
      statuses: ACTIVE_RIDE_STATUSES,
      limit: 1,
      offset: 0,
    });
    return active.length > 0;
  }

  async canReceiveOffers(driverId: string): Promise<boolean> {
    const wallet = await this.walletRepo.findByDriverId(driverId);
    if (!wallet || !isDriverEligibleForNewRides(wallet)) return false;
    return !(await this.hasActiveRide(driverId));
  }
}
