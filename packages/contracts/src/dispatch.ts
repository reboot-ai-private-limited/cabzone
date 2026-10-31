import type { VehicleCategory } from './vehicles.js';

export interface DispatchFleetDriverDto {
  driverId: string;
  userId: string;
  vehicleCategory: VehicleCategory;
  lat: number;
  lng: number;
  heading: number | null;
  speedMps: number | null;
  status: 'ONLINE' | 'BUSY';
  activeRideId: string | null;
  locationUpdatedAt: string;
  driverName?: string | undefined;
  vehicleRegistration?: string | undefined;
}

export interface SimulateFleetPayload {
  enabled?: boolean | undefined;
  action?: 'seed' | 'clear' | undefined;
}

export interface SimulateFleetResponseDto {
  count: number;
  simulated: boolean;
  drivers: DispatchFleetDriverDto[];
}
