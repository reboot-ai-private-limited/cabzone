import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type {
  VerifyOtpRequestDto,
  VerifyOtpResponseDto,
  RequestOtpResponseDto,
  DriverDto,
} from '@cabzone/contracts';

function getApiBaseUrl(): string {
  // 1. Explicit environment variable
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');
  }

  // 2. Web browser: localhost is fine
  if (Platform.OS === 'web') {
    return 'http://localhost:4000';
  }

  // 3. Dynamic IP from Expo Host URI (auto-detects dev machine LAN IP when running on phone)
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    return `http://${ip}:4000`;
  }

  // 4. Fallback to local Wi-Fi IP
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

  async getDriverProfile(token: string): Promise<DriverDto | null> {
    try {
      return await request<DriverDto>('/api/v1/driver/profile/me', { method: 'GET' }, token);
    } catch {
      return null;
    }
  },
};
