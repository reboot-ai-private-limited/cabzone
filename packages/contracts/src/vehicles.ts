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
