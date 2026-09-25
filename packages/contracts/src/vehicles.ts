/**
 * Vehicle categories supported by the Cabzon platform.
 *
 * Per Decision D-025:
 * - CAB: Active launch category (standard 4-wheeler cab/car).
 * - E_RICKSHAW: Staged category (electric rickshaw, coming soon).
 */
export const VEHICLE_CATEGORIES = ['CAB', 'E_RICKSHAW'] as const;
export type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];

export interface VehicleCategoryInfo {
  category: VehicleCategory;
  displayName: string;
  status: 'ACTIVE' | 'COMING_SOON';
}

export const VEHICLE_CATEGORY_REGISTRY: Record<VehicleCategory, VehicleCategoryInfo> = {
  CAB: {
    category: 'CAB',
    displayName: 'Cab',
    status: 'ACTIVE',
  },
  E_RICKSHAW: {
    category: 'E_RICKSHAW',
    displayName: 'E-Rickshaw',
    status: 'COMING_SOON',
  },
};

export const VEHICLE_VERIFICATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;
export type VehicleVerificationStatus = (typeof VEHICLE_VERIFICATION_STATUSES)[number];

export const INDIAN_VEHICLE_REG_REGEX = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;

export interface VehicleDto {
  id: string;
  driverId: string;
  vehicleType: VehicleCategory;
  make: string;
  model: string;
  registrationNumber: string;
  color: string | null;
  manufactureYear: number | null;
  verificationStatus: VehicleVerificationStatus;
  createdAt: string;
  updatedAt: string;
}

