import type { VehicleCategory } from '@cabzone/contracts';
import { canDriverGoOnline, type DriverEntity } from './driver.entity.js';
import type { DriverDocumentEntity } from './driverDocument.entity.js';
import { canUserAuthenticate, type UserEntity } from './user.entity.js';
import type { VehicleEntity } from './vehicle.entity.js';

export function isDriverEligibleForRide(
  driver: DriverEntity,
  user: UserEntity | null,
  vehicle: VehicleEntity | null,
  documents: DriverDocumentEntity[],
  category: VehicleCategory,
  now = new Date(),
): boolean {
  return (
    canDriverGoOnline(driver, { vehicle, documents, now }).eligible &&
    user !== null &&
    canUserAuthenticate(user) &&
    vehicle !== null &&
    vehicle.vehicleType === category
  );
}
