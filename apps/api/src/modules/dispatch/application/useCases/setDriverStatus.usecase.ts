import { AppError } from '../../../../shared/errors/AppError.js';
import type { DriverPresencePort } from '../../domain/presence.port.js';
import type { DispatchLookups } from '../dispatch.types.js';

export interface SetDriverStatusInput {
  userId: string;
  status: 'ONLINE' | 'OFFLINE';
  lat?: number | undefined;
  lng?: number | undefined;
}

export class SetDriverStatusUseCase {
  constructor(
    private readonly presence: DriverPresencePort,
    private readonly lookups: DispatchLookups,
  ) {}

  async execute(input: SetDriverStatusInput): Promise<{ status: 'ONLINE' | 'OFFLINE' }> {
    const profile = await this.lookups.getDriverProfileByUserId(input.userId);
    if (!profile) {
      throw AppError.forbidden('DRIVER_PROFILE_REQUIRED: No driver profile for this account.');
    }

    if (input.status === 'OFFLINE') {
      await this.presence.remove(profile.driverId);
      return { status: 'OFFLINE' };
    }

    if (!profile.eligibleToGoOnline) {
      throw AppError.forbidden(
        `DRIVER_NOT_ELIGIBLE: ${profile.ineligibleReason ?? 'Driver cannot go online.'}`,
      );
    }
    if (!profile.vehicleCategory) {
      throw AppError.forbidden('DRIVER_NOT_ELIGIBLE: No approved vehicle on file.');
    }
    if (input.lat === undefined || input.lng === undefined) {
      throw AppError.badRequest('LOCATION_REQUIRED: lat and lng are required to go online.');
    }

    await this.presence.set({
      driverId: profile.driverId,
      userId: profile.userId,
      vehicleCategory: profile.vehicleCategory,
      lat: input.lat,
      lng: input.lng,
      heading: null,
      speedMps: null,
      locationUpdatedAt: new Date(),
    });
    return { status: 'ONLINE' };
  }
}
