import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { AuthenticatedUserSummary } from '@cabzone/contracts';

const ACCESS_TOKEN_KEY = 'cabzone_driver_access_token';
const REFRESH_TOKEN_KEY = 'cabzone_driver_refresh_token';
const DEVICE_ID_KEY = 'cabzone_driver_device_id';
const AUTH_USER_KEY = 'cabzone_driver_auth_user';
const KYC_DRAFT_PREFIX = 'cabzone_driver_kyc_draft_';
const LAST_KYC_USER_KEY = 'cabzone_driver_last_kyc_user';

export interface PersistedKycDraft {
  step: number;
  vehicleType?: 'CAB' | 'E_RICKSHAW';
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | '';
  city?: string;
  isCustomCity?: boolean;
  registrationNumber?: string;
  make?: string;
  model?: string;
  color?: string;
  manufactureYear?: number | null;
  dlNumber?: string;
  dlExpiry?: string;
}

export async function saveKycDraft(userId: string, draft: PersistedKycDraft): Promise<void> {
  if (!userId) return;
  const sanitized: PersistedKycDraft = {
    step: Math.min(Math.max(draft.step || 1, 1), 7),
    vehicleType: draft.vehicleType,
    firstName: draft.firstName,
    lastName: draft.lastName,
    dateOfBirth: draft.dateOfBirth,
    gender: draft.gender,
    city: draft.city,
    isCustomCity: draft.isCustomCity,
    registrationNumber: draft.registrationNumber,
    make: draft.make,
    model: draft.model,
    color: draft.color,
    manufactureYear: draft.manufactureYear ?? null,
    dlNumber: draft.dlNumber,
    dlExpiry: draft.dlExpiry,
  };
  await Promise.all([
    setItem(`${KYC_DRAFT_PREFIX}${userId}`, JSON.stringify(sanitized)),
    setItem(LAST_KYC_USER_KEY, userId),
  ]);
}

export async function getKycDraft(userId: string): Promise<PersistedKycDraft | null> {
  if (!userId) return null;
  const raw = await getItem(`${KYC_DRAFT_PREFIX}${userId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedKycDraft;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearKycDraft(userId?: string | null): Promise<void> {
  const targetUserId = userId || (await getItem(LAST_KYC_USER_KEY));
  if (targetUserId) {
    await removeItem(`${KYC_DRAFT_PREFIX}${targetUserId}`);
  }
  await removeItem(LAST_KYC_USER_KEY);
}

export async function saveAuthUser(user: AuthenticatedUserSummary): Promise<void> {
  await setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export async function getAuthUser(): Promise<AuthenticatedUserSummary | null> {
  const value = await getItem(AUTH_USER_KEY);
  if (!value) return null;
  try {
    const user = JSON.parse(value) as AuthenticatedUserSummary;
    return typeof user.id === 'string' &&
      typeof user.phoneE164 === 'string' &&
      typeof user.role === 'string'
      ? user
      : null;
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore in web private browsing
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return await SecureStore.getItemAsync(key);
}

export async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function saveAuthTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([
    setItem(ACCESS_TOKEN_KEY, accessToken),
    setItem(REFRESH_TOKEN_KEY, refreshToken),
  ]);
}

export async function getAccessToken(): Promise<string | null> {
  return getItem(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return getItem(REFRESH_TOKEN_KEY);
}

export async function clearAuthTokens(): Promise<void> {
  await clearKycDraft();
  await Promise.all([
    removeItem(ACCESS_TOKEN_KEY),
    removeItem(REFRESH_TOKEN_KEY),
    removeItem(AUTH_USER_KEY),
  ]);
}

export async function getOrCreateDeviceId(): Promise<string> {
  let deviceId = await getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId =
      'dev-device-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    await setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}
