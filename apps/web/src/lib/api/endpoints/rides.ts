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
  pickupOtp?: string;
  createdAt: string;
}

export interface CreateRidePayload {
  quoteToken: string;
  proposedFarePaise: number;
  passenger: {
    name: string;
    phoneE164: string;
    riderId?: string | null;
  };
  vehicleCategory: VehicleCategory;
  pickup: { lat: number; lng: number };
  drop: { lat: number; lng: number };
  riderId?: string;
}

export interface CompleteRideResultDto {
  ride: AdminRideDto;
  farePaise: number;
  commissionPaise: number;
  walletBalancePaise: number;
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
    query: { statuses?: RideStatus[]; limit: number; offset?: number; riderId?: string },
    token?: string,
    signal?: AbortSignal,
  ) =>
    request<AdminRideDto[]>('/v1/rides', {
      method: 'GET',
      query: {
        riderId: query.riderId,
        status: query.statuses?.join(','),
        limit: query.limit,
        offset: query.offset ?? 0,
      },
      token,
      signal,
    }),

  get: (rideId: string, token?: string, signal?: AbortSignal) =>
    request<AdminRideDto & { pickupOtp?: string }>(`/v1/rides/${rideId}`, { method: 'GET', token, signal }),

  events: (rideId: string, token?: string, signal?: AbortSignal) =>
    request<RideEventDto[]>(`/v1/rides/${rideId}/events`, { method: 'GET', token, signal }),

  create: (body: CreateRidePayload, token?: string) =>
    request<AdminRideDto>('/v1/rides', { method: 'POST', body, token }),

  accept: (rideId: string, driverId?: string, token?: string) =>
    request<AdminRideDto & { pickupOtp?: string }>(`/v1/rides/${rideId}/accept`, {
      method: 'POST',
      body: driverId ? { driverId } : {},
      token,
    }),

  enRoute: (rideId: string, driverId?: string, token?: string) =>
    request<AdminRideDto>(`/v1/rides/${rideId}/en-route`, {
      method: 'POST',
      body: driverId ? { driverId } : {},
      token,
    }),

  arrived: (rideId: string, driverId?: string, token?: string) =>
    request<AdminRideDto>(`/v1/rides/${rideId}/arrived`, {
      method: 'POST',
      body: driverId ? { driverId } : {},
      token,
    }),

  start: (rideId: string, otp: string, driverId?: string, token?: string) =>
    request<AdminRideDto>(`/v1/rides/${rideId}/start`, {
      method: 'POST',
      body: { otp, driverId },
      token,
    }),

  complete: (rideId: string, driverId?: string, token?: string) =>
    request<CompleteRideResultDto>(`/v1/rides/${rideId}/complete`, {
      method: 'POST',
      body: driverId ? { driverId } : {},
      token,
    }),

  cancel: (rideId: string, reason: string, token?: string) =>
    request<{ ride: AdminRideDto }>(`/v1/rides/${rideId}/cancel`, {
      method: 'POST',
      body: { reason },
      token,
    }),
};
