import { request } from '../../../lib/api/client.js';

export interface VerifyOtpResponse {
  accessToken: string;
  refreshToken: string;
}

export async function requestOtp(phoneE164: string): Promise<void> {
  await request<{ message?: string }>('/v1/auth/otp/request', {
    method: 'POST',
    body: { phoneE164 },
  });
}

export async function verifyOtp(
  phoneE164: string,
  otp: string,
  deviceId: string = 'admin-web-console',
): Promise<VerifyOtpResponse> {
  const data = await request<VerifyOtpResponse>('/v1/auth/otp/verify', {
    method: 'POST',
    body: {
      phoneE164,
      otp,
      deviceId,
    },
  });

  if (typeof window !== 'undefined' && data.accessToken) {
    localStorage.setItem('Cabzonee_access_token', data.accessToken);
    localStorage.setItem('Cabzonee_refresh_token', data.refreshToken);
    localStorage.setItem('Cabzonee_admin_phone', phoneE164);
  }

  return data;
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('Cabzonee_access_token');
}

export function getStoredPhone(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('Cabzonee_admin_phone');
}

export function logout(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('Cabzonee_access_token');
    localStorage.removeItem('Cabzonee_refresh_token');
    localStorage.removeItem('Cabzonee_admin_phone');
  }
}
