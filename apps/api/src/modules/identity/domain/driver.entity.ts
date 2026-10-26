import {
  REQUIRED_DRIVER_DOCUMENT_TYPES,
  isDocumentValidForVehicle,
  type DriverDocumentEntity,
} from './driverDocument.entity.js';
import { isVehicleApproved, type VehicleEntity } from './vehicle.entity.js';

export type DriverStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
export type DriverKycStatus = 'PENDING' | 'VERIFIED' | 'EXPIRED' | 'FAILED';
export type DriverOperationalStatus = 'OFFLINE' | 'ONLINE' | 'BUSY';

export interface DriverEntity {
  id: string;
  userId: string;
  name?: string | null | undefined;
  profilePhotoUrl?: string | null | undefined;
  alternatePhone?: string | null | undefined;
  gender?: string | null | undefined;
  dateOfBirth?: string | null | undefined;
  experience?: string | null | undefined;
  emergencyContact?: string | null | undefined;
  address?: string | null | undefined;
  dlNumber?: string | null | undefined;
  dlExpiry?: string | null | undefined;
  status: DriverStatus;
  kycStatus: DriverKycStatus;
  operationalStatus: DriverOperationalStatus;
  ratingAverage: number | null;
  ratingCount: number;
  trustScore: number | null;
  currentVehicleId: string | null;
  walletId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DriverEligibilityResult {
  eligible: boolean;
  reason?: string;
}

export interface CanDriverGoOnlineOptions {
  vehicle?: VehicleEntity | null;
  documents?: DriverDocumentEntity[];
  now?: Date;
}

export function canDriverGoOnline(
  driver: DriverEntity,
  opts?: CanDriverGoOnlineOptions,
): DriverEligibilityResult {
  if (driver.status !== 'ACTIVE') {
    return { eligible: false, reason: `Driver account is ${driver.status}` };
  }
  if (
    driver.kycStatus !== 'VERIFIED' &&
    !(driver.kycStatus === 'PENDING' && opts?.documents !== undefined)
  ) {
    return { eligible: false, reason: `KYC verification is ${driver.kycStatus}` };
  }
  if (!driver.currentVehicleId) {
    return { eligible: false, reason: 'No vehicle currently assigned' };
  }

  if (opts && 'vehicle' in opts) {
    const vehicle = opts.vehicle;
    if (
      !vehicle ||
      vehicle.id !== driver.currentVehicleId ||
      vehicle.driverId !== driver.id ||
      !isVehicleApproved(vehicle)
    ) {
      return { eligible: false, reason: 'Assigned vehicle is not approved' };
    }
  }

  if (opts?.documents !== undefined) {
    const now = opts.now ?? new Date();
    for (const type of REQUIRED_DRIVER_DOCUMENT_TYPES) {
      const hasValid = opts.documents.some(
        (doc) => doc.type === type && isDocumentValidForVehicle(doc, driver.currentVehicleId, now),
      );
      if (!hasValid) {
        return {
          eligible: false,
          reason: `Compliance document ${type} is missing or expired`,
        };
      }
    }
  }

  return { eligible: true };
}
