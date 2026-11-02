import type { RideAssignedDriverDto } from '@cabzone/contracts';
import type { RideEntity } from '../domain/index.js';

/** Public rides omit contact numbers (admins opt in via `includeContacts`), OTP internals and idempotency keys via explicit field selection. */
export function toRideView(
  ride: RideEntity,
  assignedDriver: RideAssignedDriverDto | null = null,
  includeContacts = false,
) {
  const arrearsPaise = Math.max(0, ride.arrearsPaise ?? 0);
  const activeFarePaise = ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise;
  return {
    id: ride.id,
    bookerRiderId: ride.bookerRiderId,
    passenger: {
      riderId: ride.passenger.riderId,
      name: ride.passenger.name,
      ...(includeContacts && ride.passenger.phoneE164 ? { phoneE164: ride.passenger.phoneE164 } : {}),
      pickupOtpExpiresAt: ride.passenger.pickupOtpExpiresAt,
    },
    driverId: ride.driverId,
    vehicleId: ride.vehicleId,
    vehicleCategory: ride.vehicleCategory,
    pickup: {
      lat: ride.pickup.lat,
      lng: ride.pickup.lng,
      address: ride.pickup.address,
    },
    drop: {
      lat: ride.drop.lat,
      lng: ride.drop.lng,
      address: ride.drop.address,
    },
    ...(ride.stops?.length
      ? { stops: ride.stops.map((s) => ({ lat: s.lat, lng: s.lng, address: s.address })) }
      : {}),
    routeSnapshot: ride.routeSnapshot,
    zoneSnapshot: ride.zoneSnapshot,
    pricingSnapshot: ride.pricingSnapshot,
    ...(ride.tollSnapshot !== undefined ? { tollSnapshot: ride.tollSnapshot } : {}),
    ...(ride.extensionProposal !== undefined ? { extensionProposal: ride.extensionProposal } : {}),
    suggestedFarePaise: ride.suggestedFarePaise,
    proposedFarePaise: ride.proposedFarePaise,
    agreedFarePaise: ride.agreedFarePaise,
    arrearsPaise,
    totalPayablePaise: activeFarePaise + arrearsPaise,
    status: ride.status,
    cancellationReason: ride.cancellationReason,
    offeringExpiresAt: ride.offeringExpiresAt,
    acceptedAt: ride.acceptedAt,
    arrivedAt: ride.arrivedAt,
    startedAt: ride.startedAt,
    completedAt: ride.completedAt,
    settledAt: ride.settledAt,
    cancelledAt: ride.cancelledAt,
    version: ride.version,
    createdAt: ride.createdAt,
    updatedAt: ride.updatedAt,
    assignedDriver: assignedDriver
      ? {
          driverId: assignedDriver.driverId,
          name: assignedDriver.name,
          ...(includeContacts && assignedDriver.phoneE164 ? { phoneE164: assignedDriver.phoneE164 } : {}),
          profilePhotoUrl: assignedDriver.profilePhotoUrl,
          ratingAverage: assignedDriver.ratingAverage,
          ratingCount: assignedDriver.ratingCount,
          vehicle: assignedDriver.vehicle
            ? {
                vehicleId: assignedDriver.vehicle.vehicleId,
                make: assignedDriver.vehicle.make,
                model: assignedDriver.vehicle.model,
                color: assignedDriver.vehicle.color,
                registrationNumber: assignedDriver.vehicle.registrationNumber,
                vehicleCategory: assignedDriver.vehicle.vehicleCategory,
              }
            : null,
        }
      : null,
  };
}

export type RideView = ReturnType<typeof toRideView>;
