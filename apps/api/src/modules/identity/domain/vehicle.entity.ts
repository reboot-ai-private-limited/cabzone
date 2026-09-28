import type { VehicleCategory, VehicleVerificationStatus } from '@Cabzone/contracts';

export interface VehicleEntity {
  id: string;
  driverId: string;
  vehicleType: VehicleCategory;
  make: string;
  model: string;
  registrationNumber: string;
  color: string | null;
  manufactureYear: number | null;
  verificationStatus: VehicleVerificationStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export function isVehicleApproved(vehicle: VehicleEntity): boolean {
  return vehicle.verificationStatus === 'APPROVED';
}
