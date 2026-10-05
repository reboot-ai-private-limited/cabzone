import type { VehicleCategory, DispatchFleetDriverDto } from '@cabzone/contracts';
import type { DriverPresencePort } from '../../domain/presence.port.js';
import type { DispatchLookups } from '../dispatch.types.js';
import type { RideRepositoryPort } from '../../../rides/rides.public.js';

export interface ListFleetQuery {
  vehicleCategory?: VehicleCategory | undefined;
  maxAgeMs?: number | undefined;
}

export class ListFleetDriversUseCase {
  constructor(
    private readonly presence: DriverPresencePort,
    private readonly rideRepo: RideRepositoryPort,
    private readonly lookups: DispatchLookups,
  ) {}

  async execute(query?: ListFleetQuery): Promise<DispatchFleetDriverDto[]> {
    const onlineDrivers = await this.presence.listAll(query);
    if (onlineDrivers.length === 0) return [];

    // Query active rides to find which drivers are busy
    const activeRides = await this.rideRepo.list({
      statuses: ['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'TRIP_STARTED'],
      limit: 200,
      offset: 0,
    });

    const driverActiveRideMap = new Map<string, string>();
    for (const ride of activeRides) {
      if (ride.driverId) {
        driverActiveRideMap.set(ride.driverId, ride.id);
      }
    }

    const result: DispatchFleetDriverDto[] = [];
    for (const d of onlineDrivers) {
      const activeRideId = driverActiveRideMap.get(d.driverId) ?? null;
      let driverName: string | undefined;
      let phoneE164: string | undefined;
      let vehicleRegistration: string | undefined;

      if (this.lookups.getDriverInfo) {
        const info = await this.lookups.getDriverInfo(d.driverId);
        if (info) {
          driverName = info.name;
          phoneE164 = info.phoneE164;
          vehicleRegistration = info.registrationNumber;
        }
      }

      result.push({
        driverId: d.driverId,
        userId: d.userId,
        vehicleCategory: d.vehicleCategory,
        lat: d.lat,
        lng: d.lng,
        heading: d.heading,
        speedMps: d.speedMps,
        status: activeRideId ? 'BUSY' : 'ONLINE',
        activeRideId,
        locationUpdatedAt: d.locationUpdatedAt.toISOString(),
        ...(driverName ? { driverName } : {}),
        ...(phoneE164 ? { phoneE164 } : {}),
        ...(vehicleRegistration ? { vehicleRegistration } : {}),
      });
    }

    return result;
  }
}
