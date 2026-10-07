import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type {
  VerifyOtpRequestDto,
  VerifyOtpResponseDto,
  RequestOtpResponseDto,
  DriverProfileDetailDto,
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
  };
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

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    const json = (await res.json()) as ApiResponse<T>;

    if (!res.ok || json.success === false) {
      const errMsg = json.message || json.error?.message || `Request failed with status ${res.status}`;
      throw new Error(errMsg);
    }

    return json.data;
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('An unexpected network error occurred');
  }
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

  async refreshToken(refreshToken: string, deviceId: string): Promise<VerifyOtpResponseDto> {
    return request<VerifyOtpResponseDto>('/api/v1/auth/refresh', {
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
    try {
      return await request<DriverProfileDetailDto>('/api/v1/driver/profile/me', { method: 'GET' }, token);
    } catch {
      return null;
    }
  },
};

export interface CreateDriverProfilePayload {
  name?: string;
  gender?: string;
  dateOfBirth?: string;
  address?: string;
  dlNumber?: string;
  dlExpiry?: string;
  alternatePhone?: string;
  emergencyContact?: string;
}

export interface RegisterVehiclePayload {
  vehicleType: 'CAB' | 'E_RICKSHAW';
  make: string;
  model: string;
  registrationNumber: string;
  color?: string | null;
  manufactureYear?: number | null;
}

export interface UploadDocumentPayload {
  type: 'GOVERNMENT_ID' | 'DRIVING_LICENSE';
  storageKey: string;
  documentHash: string;
  documentNumberMasked?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
}

export const driverApi = {
  async getProfile(token: string): Promise<DriverProfileDetailDto | null> {
    try {
      return await request<DriverProfileDetailDto>('/api/v1/driver/profile/me', { method: 'GET' }, token);
    } catch {
      return null;
    }
  },

  async saveProfile(token: string, payload: CreateDriverProfilePayload): Promise<any> {
    return request<any>(
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

  async uploadDocument(token: string, payload: UploadDocumentPayload): Promise<any> {
    return request<any>(
      '/api/v1/driver/documents',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
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

export const dispatchApi = {
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
};

export const walletApi = {
  async getMyWallet(token: string): Promise<{
    wallet: { id: string; balancePaise: number } | null;
    transactions: any[];
  } | null> {
    try {
      return await request<{
        wallet: { id: string; balancePaise: number } | null;
        transactions: any[];
      }>('/api/v1/driver/wallet/me', { method: 'GET' }, token);
    } catch {
      return null;
    }
  },
};
