import type { RideStatus, VehicleCategory } from '@cabzone/contracts';
import { request } from '../client.js';

export interface AdminRideDto {
  id: string;
  bookerRiderId: string;
  passenger: { riderId: string | null; name: string; phoneE164: string };
  driverId: string | null;
  vehicleCategory: VehicleCategory;
  pickup: { lat: number; lng: number; address: string | null };
  drop: { lat: number; lng: number; address: string | null };
  routeSnapshot: { distanceM: number; durationSeconds: number };
  zoneSnapshot: { classification: string; destinationStateCode?: string | null };
  suggestedFarePaise: number;
  proposedFarePaise: number | null;
  agreedFarePaise: number | null;
  status: RideStatus;
  cancellationReason: string | null;
  acceptedAt: string | null;
  arrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  version: number;
  createdAt: string;
}

export interface RideEventDto {
  id: string;
  eventType: string;
  actorType: 'RIDER' | 'DRIVER' | 'ADMIN' | 'SYSTEM';
  actorId: string | null;
  previousStatus: RideStatus | null;
  newStatus: RideStatus | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export const ACTIVE_RIDE_STATUSES: RideStatus[] = [
  'OFFERING',
  'DRIVER_ASSIGNED',
  'DRIVER_EN_ROUTE',
  'DRIVER_ARRIVED',
  'TRIP_STARTED',
];

export const ridesApi = {
  list: (
    query: { statuses?: RideStatus[]; limit: number; offset?: number },
    token?: string,
    signal?: AbortSignal,
  ) =>
    request<AdminRideDto[]>('/v1/rides', {
      method: 'GET',
      query: {
        status: query.statuses?.join(','),
        limit: query.limit,
        offset: query.offset ?? 0,
      },
      token,
      signal,
    }),

  events: (rideId: string, token?: string, signal?: AbortSignal) =>
    request<RideEventDto[]>(`/v1/rides/${rideId}/events`, { method: 'GET', token, signal }),
};
