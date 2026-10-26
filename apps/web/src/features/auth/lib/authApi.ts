import { ADMIN_ROLES, type AdminRole } from '@cabzone/contracts';
import { request } from '../../../lib/api/client.js';

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  CITY_ADMIN: 'City Admin',
  SUPPORT_ADMIN: 'Support Admin',
  FINANCE_ADMIN: 'Finance Admin',
};

const ADMIN_ROLE_SET = new Set<string>(ADMIN_ROLES);

export function isAdminRole(role: unknown): role is AdminRole {
  return typeof role === 'string' && ADMIN_ROLE_SET.has(role);
}

/**
 * Decodes the unverified `role` claim from a stored JWT so UI navigation and role labels
 * immediately reflect the signed-in admin's role (including pre-existing browser sessions
 * and rotated refresh tokens). Server routes still enforce authoritative RBAC on every call.
 */
export function decodeJwtAdminRole(token: string | null | undefined): AdminRole | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const json =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8');
    const payload = JSON.parse(json) as { role?: unknown };
    return isAdminRole(payload.role) ? payload.role : null;
  } catch {
    return null;
  }
}

export interface VerifyOtpResponse {
  accessToken: string;
  refreshToken: string;
  user?: {
    id: string;
    phoneE164: string;
    role: string;
  };
}

export interface AdminLoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: {
    id: string;
    phoneE164: string;
    name?: string | null | undefined;
    role: string;
  };
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
    const role = isAdminRole(data.user?.role)
      ? data.user.role
      : decodeJwtAdminRole(data.accessToken);
    if (role) {
      localStorage.setItem('Cabzonee_admin_role', role);
    } else {
      localStorage.removeItem('Cabzonee_admin_role');
    }
  }

  return data;
}

export async function adminLogin(
  phoneE164: string,
  password: string,
  deviceId: string = 'admin-web-console',
): Promise<AdminLoginResponse> {
  const data = await request<AdminLoginResponse>('/v1/auth/admin/login', {
    method: 'POST',
    body: {
      phoneE164,
      password,
      deviceId,
    },
  });

  if (typeof window !== 'undefined' && data.accessToken) {
    localStorage.setItem('Cabzonee_access_token', data.accessToken);
    localStorage.setItem('Cabzonee_refresh_token', data.refreshToken);
    localStorage.setItem('Cabzonee_admin_phone', phoneE164);
    const role = isAdminRole(data.user?.role)
      ? data.user.role
      : decodeJwtAdminRole(data.accessToken);
    if (role) {
      localStorage.setItem('Cabzonee_admin_role', role);
    }
    if (data.user?.name) {
      localStorage.setItem('Cabzonee_admin_name', data.user.name);
    } else {
      localStorage.removeItem('Cabzonee_admin_name');
    }
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

export function getStoredAdminRole(): AdminRole | null {
  if (typeof window === 'undefined') return null;
  const fromJwt = decodeJwtAdminRole(localStorage.getItem('Cabzonee_access_token'));
  if (fromJwt) return fromJwt;
  const stored = localStorage.getItem('Cabzonee_admin_role');
  return isAdminRole(stored) ? stored : null;
}

export function getStoredAdminName(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('Cabzonee_admin_name');
}

export function logout(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('Cabzonee_access_token');
    localStorage.removeItem('Cabzonee_refresh_token');
    localStorage.removeItem('Cabzonee_admin_phone');
    localStorage.removeItem('Cabzonee_admin_role');
    localStorage.removeItem('Cabzonee_admin_name');
  }
}
