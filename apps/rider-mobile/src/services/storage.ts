import * as SecureStore from 'expo-secure-store';
import { DEFAULT_MAP_THEME, normalizeMapTheme, type MapTheme } from './map-theme';
import { Platform } from 'react-native';
import type { AuthenticatedUserSummary } from '@cabzone/contracts';
import type { SavedRouteTemplate } from './rider-helpers';
import type { SavedPlace } from './recent-places';

const ACCESS_TOKEN_KEY = 'cabzone_rider_access_token';
const REFRESH_TOKEN_KEY = 'cabzone_rider_refresh_token';
const DEVICE_ID_KEY = 'cabzone_rider_device_id';
const AUTH_USER_KEY = 'cabzone_rider_auth_user';
const SAVED_TEMPLATES_PREFIX = 'cabzone_rider_templates_';
const PREFS_PREFIX = 'cabzone_rider_prefs_';
const SAVED_PLACES_PREFIX = 'cabzone_rider_saved_places_';

export interface RiderLocalPreferences {
  operationalCity: string;
  distanceUnit: 'km' | 'mi';
  language: 'en' | 'hi' | 'bn';
  mapTheme: MapTheme;
}

const DEFAULT_PREFS: RiderLocalPreferences = {
  operationalCity: 'Siliguri',
  distanceUnit: 'km',
  language: 'en',
  mapTheme: DEFAULT_MAP_THEME,
};

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
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

export async function clearAuthTokens(): Promise<void> {
  await Promise.all([
    removeItem(ACCESS_TOKEN_KEY),
    removeItem(REFRESH_TOKEN_KEY),
    removeItem(AUTH_USER_KEY),
  ]);
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const generated = `rider-${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await setItem(DEVICE_ID_KEY, generated);
  return generated;
}

export async function getSavedRouteTemplates(userId: string): Promise<SavedRouteTemplate[]> {
  if (!userId) return [];
  const raw = await getItem(`${SAVED_TEMPLATES_PREFIX}${userId}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SavedRouteTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveRouteTemplates(
  userId: string,
  templates: SavedRouteTemplate[],
): Promise<void> {
  if (!userId) return;
  await setItem(`${SAVED_TEMPLATES_PREFIX}${userId}`, JSON.stringify(templates.slice(0, 20)));
}

export async function getSavedPlaces(userId: string): Promise<SavedPlace[]> {
  if (!userId) return [];
  const raw = await getItem(`${SAVED_PLACES_PREFIX}${userId}`);
  try {
    const parsed = raw ? (JSON.parse(raw) as SavedPlace[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveSavedPlaces(userId: string, places: SavedPlace[]): Promise<void> {
  if (!userId) return;
  await setItem(`${SAVED_PLACES_PREFIX}${userId}`, JSON.stringify(places.slice(0, 30)));
}

export async function getRiderPreferences(userId: string): Promise<RiderLocalPreferences> {
  if (!userId) return DEFAULT_PREFS;
  const raw = await getItem(`${PREFS_PREFIX}${userId}`);
  if (!raw) return DEFAULT_PREFS;
  try {
    const parsed = JSON.parse(raw) as Partial<RiderLocalPreferences>;
    return {
      operationalCity: parsed.operationalCity || DEFAULT_PREFS.operationalCity,
      distanceUnit: parsed.distanceUnit === 'mi' ? 'mi' : 'km',
      language:
        parsed.language === 'hi' || parsed.language === 'bn' ? parsed.language : 'en',
      mapTheme: normalizeMapTheme(parsed.mapTheme),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function saveRiderPreferences(
  userId: string,
  prefs: RiderLocalPreferences,
): Promise<void> {
  if (!userId) return;
  await setItem(`${PREFS_PREFIX}${userId}`, JSON.stringify(prefs));
}
