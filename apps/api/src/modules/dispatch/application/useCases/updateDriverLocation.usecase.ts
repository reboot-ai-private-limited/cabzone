import { AppError } from '../../../../shared/errors/AppError.js';
import type { DriverPresencePort } from '../../domain/presence.port.js';
import type { DispatchLookups } from '../dispatch.types.js';

export interface UpdateDriverLocationInput {
  userId: string;
  lat: number;
  lng: number;
  heading?: number | null | undefined;
  speedMps?: number | null | undefined;
}

export interface DriverLocationObserver {
  driverLocationUpdated(
    driverId: string,
    location: { lat: number; lng: number; heading: number | null; speedMps: number | null },
  ): Promise<void>;
}

/** High-frequency path: touches only the presence store, never the primary database. */
export class UpdateDriverLocationUseCase {
  constructor(
    private readonly presence: DriverPresencePort,
    private readonly lookups: DispatchLookups,
    private readonly observer?: DriverLocationObserver,
  ) {}

  async execute(input: UpdateDriverLocationInput): Promise<void> {
    const profile = await this.lookups.getDriverProfileByUserId(input.userId);
    if (!profile) {
      throw AppError.forbidden('DRIVER_PROFILE_REQUIRED: No driver profile for this account.');
    }
    const current = await this.presence.get(profile.driverId);
    if (!current) {
      throw AppError.conflict('DRIVER_OFFLINE: Go online before sending location updates.');
    }

    const location = {
      lat: input.lat,
      lng: input.lng,
      heading: input.heading ?? null,
      speedMps: input.speedMps ?? null,
    };
    await this.presence.set({ ...current, ...location, locationUpdatedAt: new Date() });
    await this.observer?.driverLocationUpdated(profile.driverId, location);
  }
}
