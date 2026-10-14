import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getAccessToken, getOrCreateDeviceId, getRefreshToken, saveAuthTokens } from './storage';
import type {
  CancellationReason,
  DriverDocumentDto,
  DriverDto,
  DriverProfileDetailDto,
  RefreshTokenResponseDto,
  RequestOtpResponseDto,
  RideDto,
  RideEventDto,
  RideStatus,
  SaveDriverProfileRequestDto,
  VehicleCategory,
  VerifyOtpRequestDto,
  VerifyOtpResponseDto,
  WalletDto,
  WalletTransactionDto,
} from '@cabzone/contracts';

export type { DriverProfileDetailDto };

function getApiBaseUrl(): string {
  // 1. Explicit environment variable
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');
  }

  // 2. Web browser: localhost is fine
  if (Platform.OS === 'web') {
    return 'http://localhost:4000';
  }

  // 3. Dynamic IP from Expo Host URI ONLY if it's a real routable LAN IPv4 (not tunnel domain, not 169.254.*)
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

  // 4. Default to local Wi-Fi IP
  return 'http://192.168.1.5:4000';
}

export const API_BASE_URL = getApiBaseUrl();

interface ApiResponse<T> {
  success: boolean;
  data: T;
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

export function subscribeAccessToken(listener: (token: string | null) => void): () => void {
  accessTokenListeners.add(listener);
  return () => { accessTokenListeners.delete(listener); };
}

function publishAccessToken(token: string | null): void {
  for (const listener of accessTokenListeners) listener(token);
}

async function recoverAccessToken(failedToken: string): Promise<string> {
  const storedToken = await getAccessToken();
  if (storedToken && storedToken !== failedToken) {
    // A background refresh or account switch changed credentials; never replay an old request as another user.
    publishAccessToken(storedToken);
    throw new ApiError('Session changed. Retry the action.', { status: 401 });
  }
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) throw new ApiError('Session expired. Please sign in again.', { status: 401 });
      const refreshed = await authApi.refreshToken(refreshToken, await getOrCreateDeviceId());
      if (await getRefreshToken() !== refreshToken) {
        throw new ApiError('Session changed. Retry the action.', { status: 401 });
      }
      await saveAuthTokens(refreshed.accessToken, refreshed.refreshToken);
      publishAccessToken(refreshed.accessToken);
      return refreshed.accessToken;
    })().catch(async (error: unknown) => {
      if (isApiError(error) && error.isUnauthorized && await getAccessToken() === failedToken) {
        publishAccessToken(null);
      }
      throw error;
    }).finally(() => { refreshInFlight = null; });
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
      code: json.error?.code,
      details: json.error?.details,
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
    return request<void>(
      '/api/v1/auth/logout',
      {
        method: 'POST',
      },
      token,
    );
  },

  async getDriverProfile(token: string): Promise<DriverProfileDetailDto | null> {
    return request<DriverProfileDetailDto>('/api/v1/driver/profile/me', { method: 'GET' }, token);
  },
};
export type CreateDriverProfilePayload = SaveDriverProfileRequestDto;

export interface RegisterVehiclePayload {
  vehicleType: 'CAB' | 'E_RICKSHAW';
  make: string;
  model: string;
  registrationNumber: string;
  color?: string | null;
  manufactureYear?: number | null;
}

export const driverApi = {
  async getProfile(token: string): Promise<DriverProfileDetailDto | null> {
    return request<DriverProfileDetailDto>('/api/v1/driver/profile/me', { method: 'GET' }, token);
  },

  async saveProfile(token: string, payload: CreateDriverProfilePayload): Promise<DriverDto> {
    return request<DriverDto>(
      '/api/v1/driver/profile',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token,
    );
  },

  async createApplication(token: string): Promise<any> {
    return request<any>(
      '/api/v1/driver/application',
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      token,
    );
  },

  async registerVehicle(token: string, payload: RegisterVehiclePayload): Promise<any> {
    return request<any>(
      '/api/v1/driver/vehicles',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token,
    );
  },

  async uploadLicenseFile(
    token: string,
    payload: { fileDataUrl?: string; dlNumber: string; expiresAt: string },
  ): Promise<DriverDocumentDto> {
    return request<DriverDocumentDto>(
      '/api/v1/driver/documents/license',
      { method: 'POST', body: JSON.stringify(payload) },
      token,
    );
  },

  async uploadVehicleDocumentFile(
    token: string,
    payload: {
      type: 'REGISTRATION_CERTIFICATE' | 'INSURANCE' | 'PERMIT';
      fileDataUrl: string;
      expiresAt: string;
    },
  ): Promise<DriverDocumentDto> {
    return request<DriverDocumentDto>(
      '/api/v1/driver/documents/vehicle',
      { method: 'POST', body: JSON.stringify(payload) },
      token,
    );
  },

  async uploadIdentityDocumentFile(token: string, fileDataUrl: string): Promise<DriverDocumentDto> {
    return request<DriverDocumentDto>(
      '/api/v1/driver/documents/identity',
      { method: 'POST', body: JSON.stringify({ fileDataUrl }) },
      token,
    );
  },

  async submitApplication(token: string): Promise<any> {
    return request<any>(
      '/api/v1/driver/application/submit',
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      token,
    );
  },

  async testApprove(token: string): Promise<DriverProfileDetailDto> {
    return request<DriverProfileDetailDto>(
      '/api/v1/driver/application/test-approve',
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      token,
    );
  },
};
export interface UpdateLocationPayload {
  lat: number;
  lng: number;
  heading?: number | null | undefined;
  speedMps?: number | null | undefined;
}

export interface RideOfferDto {
  rideId: string;
  vehicleCategory: VehicleCategory;
  pickup: {
    lat: number;
    lng: number;
    address: string | null;
  };
  drop: {
    lat: number;
    lng: number;
    address: string | null;
  };
  proposedFarePaise: number;
  distanceToPickupM: number;
  expiresAt: string | null;
  negotiation?: { floorPaise: number; ceilingPaise: number };
}

export interface CompleteRideResultDto {
  ride: RideDto;
  farePaise: number;
  commissionPaise: number;
  walletBalancePaise: number;
}

export interface CancelRideResultDto {
  ride: RideDto;
  feeBreakdown?: {
    totalFeePaise: number;
    driverSharePaise: number;
    platformSharePaise: number;
  };
}

export const dispatchApi = {
  async getStatus(token: string): Promise<{ status: 'ONLINE' | 'OFFLINE' }> {
    return request<{ status: 'ONLINE' | 'OFFLINE' }>('/api/v1/driver/status', { method: 'GET' }, token);
  },
  async setStatus(
    token: string,
    status: 'ONLINE' | 'OFFLINE',
    coords?: { lat: number; lng: number },
  ): Promise<{ status: 'ONLINE' | 'OFFLINE' }> {
    return request<{ status: 'ONLINE' | 'OFFLINE' }>(
      '/api/v1/driver/status',
      {
        method: 'POST',
        body: JSON.stringify({
          status,
          ...(coords?.lat !== undefined && { lat: coords.lat }),
          ...(coords?.lng !== undefined && { lng: coords.lng }),
        }),
      },
      token,
    );
  },

  async updateLocation(token: string, payload: UpdateLocationPayload): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(
      '/api/v1/driver/location',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token,
    );
  },

  async listOffers(token: string): Promise<RideOfferDto[]> {
    return request<RideOfferDto[]>('/api/v1/driver/offers', { method: 'GET' }, token);
  },

  async registerPushToken(token: string, pushToken: string, installationId: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(
      '/api/v1/driver/push-token',
      { method: 'POST', body: JSON.stringify({ token: pushToken, installationId }) },
      token,
    );
  },

  async unregisterPushToken(token: string, installationId: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(
      '/api/v1/driver/push-token',
      { method: 'DELETE', body: JSON.stringify({ installationId }) },
      token,
    );
  },
};

export const ridesApi = {
  async listMyRides(
    token: string,
    params?: { status?: RideStatus | RideStatus[]; limit?: number; offset?: number },
  ): Promise<RideDto[]> {
    const query = new URLSearchParams();
    if (params?.status) {
      const statusList = Array.isArray(params.status) ? params.status.join(',') : params.status;
      query.set('status', statusList);
    }
    if (params?.limit != null) {
      query.set('limit', String(params.limit));
    }
    if (params?.offset != null) {
      query.set('offset', String(params.offset));
    }
    const qs = query.toString();
    return request<RideDto[]>(`/api/v1/rides${qs ? `?${qs}` : ''}`, { method: 'GET' }, token);
  },

  async getRide(token: string, rideId: string): Promise<RideDto> {
    return request<RideDto>(
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

  async acceptRide(token: string, rideId: string): Promise<RideDto> {
    return request<RideDto>(
      `/api/v1/rides/${encodeURIComponent(rideId)}/accept`,
      { method: 'POST', body: JSON.stringify({}) },
      token,
    );
  },

  async counterOffer(
    token: string,
    rideId: string,
    proposedFarePaise: number,
  ): Promise<{ driverId: string; proposedFarePaise: number }> {
    return request<{ driverId: string; proposedFarePaise: number }>(
      `/api/v1/rides/${encodeURIComponent(rideId)}/counter`,
      { method: 'POST', body: JSON.stringify({ proposedFarePaise }) },
      token,
    );
  },

  async markEnRoute(token: string, rideId: string): Promise<RideDto> {
    return request<RideDto>(
      `/api/v1/rides/${encodeURIComponent(rideId)}/en-route`,
      { method: 'POST', body: JSON.stringify({}) },
      token,
    );
  },

  async markArrived(token: string, rideId: string): Promise<RideDto> {
    return request<RideDto>(
      `/api/v1/rides/${encodeURIComponent(rideId)}/arrived`,
      { method: 'POST', body: JSON.stringify({}) },
      token,
    );
  },

  async startRide(token: string, rideId: string, otp: string): Promise<RideDto> {
    return request<RideDto>(
      `/api/v1/rides/${encodeURIComponent(rideId)}/start`,
      {
        method: 'POST',
        body: JSON.stringify({ otp }),
      },
      token,
    );
  },

  async completeRide(token: string, rideId: string): Promise<CompleteRideResultDto> {
    return request<CompleteRideResultDto>(
      `/api/v1/rides/${encodeURIComponent(rideId)}/complete`,
      { method: 'POST', body: JSON.stringify({}) },
      token,
    );
  },

  async confirmPayment(token: string, rideId: string): Promise<CompleteRideResultDto> {
    return request<CompleteRideResultDto>(
      `/api/v1/rides/${encodeURIComponent(rideId)}/payment/confirm`,
      { method: 'POST', body: JSON.stringify({}) },
      token,
    );
  },

  async cancelRide(
    token: string,
    rideId: string,
    reason: CancellationReason,
  ): Promise<CancelRideResultDto> {
    return request<CancelRideResultDto>(
      `/api/v1/rides/${encodeURIComponent(rideId)}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
      token,
    );
  },
};

export interface WalletViewDto {
  wallet: WalletDto | null;
  transactions: WalletTransactionDto[];
}

export const walletApi = {
  async getMyWallet(token: string): Promise<WalletViewDto | null> {
    try {
      return await request<WalletViewDto>('/api/v1/driver/wallet/me', { method: 'GET' }, token);
    } catch {
      return null;
    }
  },
};
