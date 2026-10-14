import type { VehicleCategory } from '@cabzone/contracts';
import { canDriverGoOnline, type DriverEntity } from './driver.entity.js';
import { isDocumentValid, type DriverDocumentEntity } from './driverDocument.entity.js';
import { canUserAuthenticate, type UserEntity } from './user.entity.js';
import { isVehicleApproved, type VehicleEntity } from './vehicle.entity.js';

export function isDriverEligibleForRide(
  driver: DriverEntity,
  user: UserEntity | null,
  vehicle: VehicleEntity | null,
  documents: DriverDocumentEntity[],
  category: VehicleCategory,
  now = new Date(),
): boolean {
  return canDriverGoOnline(driver).eligible &&
    user !== null && canUserAuthenticate(user) &&
    vehicle !== null && vehicle.id === driver.currentVehicleId &&
    vehicle.driverId === driver.id && isVehicleApproved(vehicle) && vehicle.vehicleType === category &&
    ['GOVERNMENT_ID', 'DRIVING_LICENSE', 'REGISTRATION_CERTIFICATE', 'INSURANCE', 'PERMIT'].every(
      (type) => {
        const document = documents.filter((doc) => doc.type === type).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
        return document !== undefined && isDocumentValid(document, now);
      },
    );
}
