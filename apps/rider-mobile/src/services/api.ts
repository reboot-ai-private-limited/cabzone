import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getAccessToken, getOrCreateDeviceId, getRefreshToken, saveAuthTokens } from './storage';
import type {
  CancellationReason,
  CreateQuoteResponseDto,
  QuoteRequestDto,
  RefreshTokenResponseDto,
  RequestOtpResponseDto,
  ResolvedLocationDetails,
  RideDto,
  RideEventDto,
  RideStatus,
  RiderDto,
  UpdateRiderProfileDto,
  VehicleCategory,
  VerifyOtpRequestDto,
  VerifyOtpResponseDto,
  ZoneDto,
} from '@cabzone/contracts';

export type RiderRideViewDto = RideDto & {
  pickupOtp?: string;
};

function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');
  }

  if (Platform.OS === 'web') {
    return 'http://localhost:4000';
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const rawHost = hostUri.split(':')[0];
    const isTunnel =
      rawHost.includes('exp.direct') || rawHost.includes('ngrok') || rawHost.includes('expo.dev');
    const isLinkLocal = rawHost.startsWith('169.254.');
    const isIpv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(rawHost);

    if (!isTunnel && !isLinkLocal && isIpv4) {
      return `http://${rawHost}:4000`;
    }
  }

  return 'http://192.168.1.5:4000';
}

export const API_BASE_URL = getApiBaseUrl();

export function getRealtimeWsUrl(token: string): string {
  const wsBase = API_BASE_URL.replace(/^http/, 'ws');
  return `${wsBase}/ws?token=${encodeURIComponent(token)}`;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  code?: string;
  message?: string;
  error?: {
    code?: string;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly status: number | undefined;
  readonly code: string | undefined;
  readonly isNetworkError: boolean;
  readonly details: unknown;

  constructor(
    message: string,
    opts?: {
      status?: number;
      code?: string;
      isNetworkError?: boolean;
      details?: unknown;
    },
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'ApiError';
    this.status = opts?.status;
    this.code = opts?.code;
    this.isNetworkError = Boolean(opts?.isNetworkError);
    this.details = opts?.details;
  }

  get isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

const accessTokenListeners = new Set<(token: string | null) => void>();
let refreshInFlight: Promise<string> | null = null;
let refreshingAccessToken: string | null = null;
let lastTokenRotation: { previous: string; current: string } | null = null;

export function subscribeAccessToken(listener: (token: string | null) => void): () => void {
  accessTokenListeners.add(listener);
  return () => {
    accessTokenListeners.delete(listener);
  };
}

function publishAccessToken(token: string | null): void {
  for (const listener of accessTokenListeners) listener(token);
}

async function recoverAccessToken(failedToken: string): Promise<string> {
  const storedToken = await getAccessToken();
  if (storedToken !== failedToken) {
    if (lastTokenRotation?.previous === failedToken && lastTokenRotation.current === storedToken) {
      return storedToken;
    }
    if (refreshInFlight && refreshingAccessToken === failedToken) return refreshInFlight;
    throw new ApiError('Session changed. Retry the action.', { code: 'SESSION_CHANGED' });
  }
  if (refreshInFlight && refreshingAccessToken !== failedToken) {
    throw new ApiError('Session changed. Retry the action.', { code: 'SESSION_CHANGED' });
  }
  if (!refreshInFlight) {
    refreshingAccessToken = failedToken;
    refreshInFlight = (async () => {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        throw new ApiError('Session expired. Please sign in again.', { status: 401 });
      }
      const refreshed = await authApi.refreshToken(refreshToken, await getOrCreateDeviceId());
      if ((await getRefreshToken()) !== refreshToken || (await getAccessToken()) !== failedToken) {
        throw new ApiError('Session changed. Retry the action.', { code: 'SESSION_CHANGED' });
      }
      await saveAuthTokens(refreshed.accessToken, refreshed.refreshToken);
      lastTokenRotation = { previous: failedToken, current: refreshed.accessToken };
      publishAccessToken(refreshed.accessToken);
      return refreshed.accessToken;
    })()
      .catch(async (error: unknown) => {
        if (isApiError(error) && error.isUnauthorized && (await getAccessToken()) === failedToken) {
          publishAccessToken(null);
        }
        throw error;
      })
      .finally(() => {
        refreshInFlight = null;
        refreshingAccessToken = null;
      });
  }
  return refreshInFlight;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(options.headers as Record<string, string>),
  };

  let res: Response;
  let currentToken = token;
  try {
    for (let attempt = 0; ; attempt++) {
      if (currentToken) headers.Authorization = `Bearer ${currentToken}`;
      res = await fetch(url, { ...options, headers });
      if (res.status !== 401 || !currentToken || attempt >= 1) break;
      currentToken = await recoverAccessToken(currentToken);
    }
  } catch (err: unknown) {
    if (isApiError(err)) throw err;
    const msg = err instanceof Error ? err.message : 'Unable to reach Cabzone server';
    throw new ApiError(msg, { isNetworkError: true });
  }

  let json: ApiResponse<T> | null = null;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    if (!res.ok) {
      throw new ApiError(`Request failed with status ${res.status}`, {
        status: res.status,
      });
    }
    return undefined as T;
  }

  if (!res.ok || json.success === false) {
    const errMsg =
      json.message || json.error?.message || `Request failed with status ${res.status}`;
    throw new ApiError(errMsg, {
      status: res.status,
      code: json.code ?? json.error?.code,
      details: json.data !== undefined ? json.data : json.error?.details,
    });
  }

  return json.data;
}

export const authApi = {
  async requestOtp(phoneE164: string): Promise<RequestOtpResponseDto> {
    return request<RequestOtpResponseDto>('/api/v1/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phoneE164 }),
    });
  },

  async verifyOtp(payload: VerifyOtpRequestDto): Promise<VerifyOtpResponseDto> {
    return request<VerifyOtpResponseDto>('/api/v1/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async refreshToken(refreshToken: string, deviceId: string): Promise<RefreshTokenResponseDto> {
    return request<RefreshTokenResponseDto>('/api/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken, deviceId }),
    });
  },

  async logout(token: string): Promise<void> {
    return request<void>('/api/v1/auth/logout', { method: 'POST' }, token);
  },
};

export const riderProfileApi = {
  async getProfile(token: string): Promise<RiderDto> {
    return request<RiderDto>('/api/v1/riders/me', { method: 'GET' }, token);
  },

  async updateProfile(token: string, payload: UpdateRiderProfileDto): Promise<RiderDto> {
    return request<RiderDto>(
      '/api/v1/riders/me',
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      token,
    );
  },
};

export const geoAndPricingApi = {
  async createQuote(
    token: string | null,
    payload: QuoteRequestDto,
  ): Promise<CreateQuoteResponseDto> {
    return request<CreateQuoteResponseDto>(
      '/api/v1/pricing/quotes',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token,
    );
  },

  async reverseGeocode(
    token: string | null,
    lat: number,
    lng: number,
  ): Promise<ResolvedLocationDetails> {
    return request<ResolvedLocationDetails>(
      `/api/v1/routing/reverse-geocode?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
      { method: 'GET' },
      token,
    );
  },

  async listActiveCities(token: string | null): Promise<ZoneDto[]> {
    const res = await request<{ items?: ZoneDto[]; zones?: ZoneDto[] } | ZoneDto[]>(
      '/api/v1/zones?status=ACTIVE&zoneType=CITY',
      { method: 'GET' },
      token,
    );
    if (Array.isArray(res)) return res;
    return res.items ?? res.zones ?? [];
  },
};

export interface CreateRiderRidePayload {
  quoteToken: string;
  proposedFarePaise: number;
  idempotencyKey?: string;
  passenger: {
    name: string;
    phoneE164: string;
  };
  vehicleCategory: VehicleCategory;
  pickup: {
    lat: number;
    lng: number;
    address?: string;
  };
  drop: {
    lat: number;
    lng: number;
    address?: string;
  };
}

export const riderRidesApi = {
  async switchToCash(
    token: string,
    rideId: string,
  ): Promise<import('@cabzone/contracts').RidePaymentStateDto> {
    return request(
      `/api/v1/rides/${encodeURIComponent(rideId)}/payment/cash`,
      { method: 'POST' },
      token,
    );
  },
  async createUpiSession(
    token: string,
    rideId: string,
  ): Promise<import('@cabzone/contracts').RideUpiSessionDto> {
    return request(
      `/api/v1/rides/${encodeURIComponent(rideId)}/payment/upi/session`,
      { method: 'POST' },
      token,
    );
  },
  async createUpiPayment(
    token: string,
    rideId: string,
  ): Promise<import('@cabzone/contracts').RideUpiCheckoutDto> {
    return request(
      `/api/v1/rides/${encodeURIComponent(rideId)}/payment/upi`,
      { method: 'POST' },
      token,
    );
  },
  async verifyUpiPayment(
    token: string,
    rideId: string,
    proof: { orderId: string; paymentId: string; signature: string },
  ): Promise<import('@cabzone/contracts').RidePaymentStateDto> {
    return request(
      `/api/v1/rides/${encodeURIComponent(rideId)}/payment/upi/verify`,
      {
        method: 'POST',
        body: JSON.stringify({
          orderId: proof.orderId,
          paymentId: proof.paymentId,
          signature: proof.signature,
        }),
      },
      token,
    );
  },
  async upiPaymentStatus(
    token: string,
    rideId: string,
  ): Promise<import('@cabzone/contracts').RidePaymentStateDto> {
    return request(
      `/api/v1/rides/${encodeURIComponent(rideId)}/payment/upi/status`,
      { method: 'GET' },
      token,
    );
  },
  async createRide(token: string, payload: CreateRiderRidePayload): Promise<RiderRideViewDto> {
    const { idempotencyKey, ...body } = payload;
    return request<RiderRideViewDto>(
      '/api/v1/rides',
      {
        method: 'POST',
        ...(idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {}),
        body: JSON.stringify(body),
      },
      token,
    );
  },

  async listRides(
    token: string,
    opts?: { status?: RideStatus[]; limit?: number; offset?: number },
  ): Promise<RiderRideViewDto[]> {
    const params = new URLSearchParams();
    if (opts?.status?.length) params.set('status', opts.status.join(','));
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.offset) params.set('offset', String(opts.offset));
    const qs = params.toString();
    return request<RiderRideViewDto[]>(
      `/api/v1/rides${qs ? `?${qs}` : ''}`,
      { method: 'GET' },
      token,
    );
  },

  async getRide(token: string, rideId: string): Promise<RiderRideViewDto> {
    return request<RiderRideViewDto>(
      `/api/v1/rides/${encodeURIComponent(rideId)}`,
      { method: 'GET' },
      token,
    );
  },

  async getRideEvents(token: string, rideId: string): Promise<RideEventDto[]> {
    return request<RideEventDto[]>(
      `/api/v1/rides/${encodeURIComponent(rideId)}/events`,
      { method: 'GET' },
      token,
    );
  },

  async respondToCounter(
    token: string,
    rideId: string,
    driverId: string,
    action: 'ACCEPTED' | 'REJECTED',
  ): Promise<unknown> {
    return request<unknown>(
      `/api/v1/rides/${encodeURIComponent(rideId)}/counter/respond`,
      {
        method: 'POST',
        body: JSON.stringify({ driverId, action }),
      },
      token,
    );
  },

  async raiseFare(
    token: string,
    rideId: string,
    proposedFarePaise: number,
  ): Promise<RiderRideViewDto> {
    return request<RiderRideViewDto>(
      `/api/v1/rides/${encodeURIComponent(rideId)}/fare/raise`,
      { method: 'POST', body: JSON.stringify({ proposedFarePaise }) },
      token,
    );
  },

  async cancelRide(
    token: string,
    rideId: string,
    reason: CancellationReason,
  ): Promise<RiderRideViewDto> {
    const result = await request<{ ride: RiderRideViewDto }>(
      `/api/v1/rides/${encodeURIComponent(rideId)}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
      token,
    );
    return result.ride;
  },

  async disputePayment(token: string, rideId: string, reason: string): Promise<RiderRideViewDto> {
    return request<RiderRideViewDto>(
      `/api/v1/rides/${encodeURIComponent(rideId)}/payment/dispute`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
      token,
    );
  },
};
