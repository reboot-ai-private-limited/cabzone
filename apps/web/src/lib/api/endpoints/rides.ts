import type {
  CancellationReason,
  DriverEarningsReconciliationDto,
  DriverRideSettlementDto,
  RideStatus,
  VehicleCategory,
} from '@cabzone/contracts';
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
  zoneSnapshot: {
    classification: string;
    cityZoneId?: string | null;
    destinationStateCode?: string | null;
  };
  suggestedFarePaise: number;
  proposedFarePaise: number | null;
  agreedFarePaise: number | null;
  paymentCollection?: 'DIRECT' | 'CASH' | 'RAZORPAY_TEST' | 'RAZORPAY_UPI';
  driverSettlement?: DriverRideSettlementDto;
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
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export type DisputeQueueStatus = 'OPEN' | 'RESOLVED' | 'ALL';
export type DisputeCollectionFilter = 'ALL' | 'CASH' | 'ONLINE';

export interface PaymentDisputesQuery {
  status?: DisputeQueueStatus;
  collection?: DisputeCollectionFilter;
  search?: string;
}

export interface PaymentDisputeEvidenceDto {
  paymentCollection: string | null;
  paymentMethod: string | null;
  paymentConfirmedAt: string | null;
  providerMode?: 'live' | 'test' | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  providerQrId: string | null;
  providerRefundReference?: string | null;
  receiptReference?: string | null;
  isDuplicateUpiAfterCash?: boolean;
  requiresManualProviderRefund?: boolean;
  commissionChargedPaise: number;
  commissionRefundedPaise: number;
  refundTransactionId: string | null;
  onlineEarningsCreditedPaise: number;
  onlineEarningsReversedPaise?: number;
  reversalTransactionId?: string | null;
}

export interface PaymentDisputeQueueItemDto {
  ride: AdminRideDto;
  ticket: RideEventDto;
  resolution: RideEventDto | null;
  evidence: PaymentDisputeEvidenceDto;
}

export const ACTIVE_RIDE_STATUSES: RideStatus[] = [
  'OFFERING',
  'DRIVER_ASSIGNED',
  'DRIVER_EN_ROUTE',
  'DRIVER_ARRIVED',
  'TRIP_STARTED',
];

export const CANCELLABLE_RIDE_STATUSES: RideStatus[] = [
  'REQUESTED',
  'OFFERING',
  'DRIVER_ASSIGNED',
  'DRIVER_EN_ROUTE',
  'DRIVER_ARRIVED',
];

let cachedRiderSession: { phoneE164: string; accessToken: string; expiresAt: number } | null = null;
const SIMULATOR_OTP = process.env.NEXT_PUBLIC_SIMULATOR_OTP ?? '000000';

/**
 * Authenticates a dedicated test Customer (RIDER) session in memory so Customer Simulator actions
 * (creating a ride, reading the rider-only 4-digit pickupOtp, cancelling, or disputing payment)
 * work against real backend role guards without overwriting the Admin token in localStorage.
 */
export async function ensureSimRiderToken(phoneE164 = '+919000000003'): Promise<string> {
  const cleaned = phoneE164.trim();
  if (
    cachedRiderSession &&
    cachedRiderSession.phoneE164 === cleaned &&
    cachedRiderSession.expiresAt > Date.now() + 30_000
  ) {
    return cachedRiderSession.accessToken;
  }

  await request<{ retryAfterSeconds?: number }>('/v1/auth/otp/request', {
    method: 'POST',
    body: { phoneE164: cleaned },
  });

  const verified = await request<{
    accessToken: string;
    expiresIn?: number;
    user?: { role: string };
  }>('/v1/auth/otp/verify', {
    method: 'POST',
    body: {
      phoneE164: cleaned,
      otp: SIMULATOR_OTP,
      deviceId: 'web-customer-simulator',
    },
  });

  cachedRiderSession = {
    phoneE164: cleaned,
    accessToken: verified.accessToken,
    expiresAt: Date.now() + (verified.expiresIn ?? 900) * 1000,
  };
  return verified.accessToken;
}

export function clearSimRiderToken(): void {
  cachedRiderSession = null;
}

const cachedDriverSessions = new Map<string, { accessToken: string; expiresAt: number }>();

/**
 * Authenticates a dedicated test Driver session in memory by phoneE164 so Simulator Driver Mirror
 * actions (Go Online, Accept Offer, Counter Offer, En Route, Arrived, Start with OTP, Complete,
 * Confirm Payment) work directly against real DRIVER role guards without touching Admin localStorage.
 */
export async function ensureSimDriverToken(phoneE164 = '+919000000002'): Promise<string> {
  const cleaned = phoneE164.trim();
  const existing = cachedDriverSessions.get(cleaned);
  if (existing && existing.expiresAt > Date.now() + 30_000) {
    return existing.accessToken;
  }

  await request<{ retryAfterSeconds?: number }>('/v1/auth/otp/request', {
    method: 'POST',
    body: { phoneE164: cleaned },
  });

  const verified = await request<{
    accessToken: string;
    expiresIn?: number;
    user?: { role: string };
  }>('/v1/auth/otp/verify', {
    method: 'POST',
    body: {
      phoneE164: cleaned,
      otp: SIMULATOR_OTP,
      deviceId: `web-driver-simulator-${cleaned.slice(-4)}`,
    },
  });

  cachedDriverSessions.set(cleaned, {
    accessToken: verified.accessToken,
    expiresAt: Date.now() + (verified.expiresIn ?? 900) * 1000,
  });
  return verified.accessToken;
}

export const ridesApi = {
  list: (
    query: {
      statuses?: RideStatus[];
      limit: number;
      offset?: number;
      riderId?: string;
      driverId?: string;
    },
    token?: string,
    signal?: AbortSignal,
  ) =>
    request<AdminRideDto[]>('/v1/rides', {
      method: 'GET',
      query: {
        riderId: query.riderId,
        driverId: query.driverId,
        status: query.statuses?.join(','),
        limit: query.limit,
        offset: query.offset ?? 0,
      },
      token,
      signal,
    }),

  get: (rideId: string, token?: string, signal?: AbortSignal) =>
    request<AdminRideDto & { pickupOtp?: string }>(`/v1/rides/${rideId}`, {
      method: 'GET',
      token,
      signal,
    }),

  events: (rideId: string, token?: string, signal?: AbortSignal) =>
    request<RideEventDto[]>(`/v1/rides/${rideId}/events`, { method: 'GET', token, signal }),

  listPaymentDisputes: (
    queryOrStatus: DisputeQueueStatus | PaymentDisputesQuery = 'OPEN',
    token?: string,
    signal?: AbortSignal,
  ) => {
    const q: PaymentDisputesQuery =
      typeof queryOrStatus === 'string' ? { status: queryOrStatus } : queryOrStatus;
    return request<PaymentDisputeQueueItemDto[]>('/v1/rides/payment/disputes', {
      method: 'GET',
      query: {
        status: q.status ?? 'OPEN',
        ...(q.collection && q.collection !== 'ALL' ? { collection: q.collection } : {}),
        ...(q.search && q.search.trim() ? { search: q.search.trim() } : {}),
        limit: 100,
        offset: 0,
      },
      token,
      signal,
    });
  },

  reconcileEarnings: (
    body: {
      mode?: 'AUDIT' | 'BACKFILL_ONLINE_EARNINGS' | 'RECONCILE_PENDING_ONLINE';
      driverId?: string;
      rideIds?: string[];
      verifyProvider?: boolean;
    } = { mode: 'AUDIT' },
    token?: string,
  ) =>
    request<DriverEarningsReconciliationDto>('/v1/rides/admin/reconcile-earnings', {
      method: 'POST',
      body,
      token,
    }),

  counter: (rideId: string, proposedFarePaise: number, token?: string) =>
    request<{ driverId: string; proposedFarePaise: number }>(`/v1/rides/${rideId}/counter`, {
      method: 'POST',
      body: { proposedFarePaise },
      token,
    }),

  respondCounter: (
    rideId: string,
    body: { driverId: string; action: 'ACCEPTED' | 'REJECTED' },
    token?: string,
  ) =>
    request<AdminRideDto>(`/v1/rides/${rideId}/counter/respond`, {
      method: 'POST',
      body,
      token,
    }),

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

  confirmPayment: (rideId: string, token?: string) =>
    request<CompleteRideResultDto>(`/v1/rides/${rideId}/payment/confirm`, {
      method: 'POST',
      body: {},
      token,
    }),

  disputePayment: (rideId: string, reason: string, token?: string) =>
    request<AdminRideDto>(`/v1/rides/${rideId}/payment/dispute`, {
      method: 'POST',
      body: { reason },
      token,
    }),

  resolvePaymentDispute: (
    rideId: string,
    outcome: 'RIDER_WINS' | 'DRIVER_WINS',
    reason: string,
    optionsOrToken?: string | { refundReference?: string; token?: string },
  ) => {
    const token = typeof optionsOrToken === 'string' ? optionsOrToken : optionsOrToken?.token;
    const refundReference =
      typeof optionsOrToken === 'object' && optionsOrToken?.refundReference?.trim()
        ? optionsOrToken.refundReference.trim()
        : undefined;
    return request<AdminRideDto>(`/v1/rides/${rideId}/payment/dispute/resolve`, {
      method: 'POST',
      body: {
        outcome,
        reason,
        ...(refundReference ? { refundReference } : {}),
      },
      token,
    });
  },

  cancel: (rideId: string, reason: CancellationReason | string, token?: string) =>
    request<{ ride: AdminRideDto }>(`/v1/rides/${rideId}/cancel`, {
      method: 'POST',
      body: { reason },
      token,
    }),

  setDriverStatus: (
    body: { status: 'ONLINE' | 'OFFLINE'; lat?: number; lng?: number },
    token: string,
  ) =>
    request<{ status: 'ONLINE' | 'OFFLINE' }>('/v1/driver/status', {
      method: 'POST',
      body,
      token,
    }),

  testApproveDriver: (token: string) =>
    request<unknown>('/v1/driver/application/test-approve', {
      method: 'POST',
      body: {},
      token,
    }),
};
