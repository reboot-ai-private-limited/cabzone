import type {
  DispatchFleetDriverDto,
  SimulateFleetPayload,
  SimulateFleetResponseDto,
  VehicleCategory,
} from '@cabzone/contracts';
import { request } from '../client.js';

export interface ListFleetQuery {
  vehicleCategory?: VehicleCategory | undefined;
  maxAgeMs?: number | undefined;
}

export const dispatchApi = {
  getFleet: (query?: ListFleetQuery, token?: string, signal?: AbortSignal) =>
    request<DispatchFleetDriverDto[]>('/v1/admin/dispatch/fleet', {
      method: 'GET',
      query: {
        vehicleCategory: query?.vehicleCategory,
        maxAgeMs: query?.maxAgeMs,
      },
      token,
      signal,
    }),

  simulateFleet: (body?: SimulateFleetPayload, token?: string) =>
    request<SimulateFleetResponseDto>('/v1/admin/dispatch/simulate-fleet', {
      method: 'POST',
      body: body ?? {},
      token,
    }),
};
