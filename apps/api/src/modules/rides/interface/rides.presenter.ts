import type { RideAssignedDriverDto } from '@cabzone/contracts';
import type { RideEntity } from '../domain/index.js';

/** Public shape of a ride: never exposes the pickup OTP hash or attempt counters. */
export function toRideView(ride: RideEntity, assignedDriver: RideAssignedDriverDto | null = null) {
  const { riderId, name, phoneE164, pickupOtpExpiresAt } = ride.passenger;
  const arrearsPaise = Math.max(0, ride.arrearsPaise ?? 0);
  const activeFarePaise = ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise;
  return {
    ...ride,
    arrearsPaise,
    totalPayablePaise: activeFarePaise + arrearsPaise,
    passenger: { riderId, name, phoneE164, pickupOtpExpiresAt },
    assignedDriver,
  };
}

export type RideView = ReturnType<typeof toRideView>;
