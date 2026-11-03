/**
 * Reliable "where am I" for the pickup default and the locate buttons.
 *
 * `getCurrentPositionAsync` on Android can wait forever when no fresh fix is available, which left
 * the pickup stuck on the preset even though the map's blue dot was already correct. This helper
 * uses a recent last-known fix straight away, waits for a fresh one only for a bounded time, and
 * falls back to an older last-known fix instead of failing.
 */

export interface DevicePosition {
  coords: { latitude: number; longitude: number; accuracy?: number | null };
  timestamp?: number;
}

export interface DeviceLocationApi {
  requestForegroundPermissionsAsync(): Promise<{ granted: boolean }>;
  getLastKnownPositionAsync(options: {
    maxAge?: number;
    requiredAccuracy?: number;
  }): Promise<DevicePosition | null>;
  getCurrentPositionAsync(options: { accuracy: number }): Promise<DevicePosition>;
}

export interface DeviceCoordinates {
  lat: number;
  lng: number;
  /** Horizontal accuracy in metres when the device reports it. */
  accuracyM: number | null;
  source: 'recent' | 'fresh' | 'stale';
}

export interface DeviceLocationOptions {
  /** Most time to wait for a fresh fix. */
  freshTimeoutMs?: number;
  /** A last-known fix younger than this and at least this accurate is used without waiting. */
  recentMaxAgeMs?: number;
  recentAccuracyM?: number;
  /** Oldest last-known fix still better than nothing when a fresh fix never arrives. */
  staleMaxAgeMs?: number;
  /** expo-location Accuracy.High. */
  highAccuracy?: number;
  wait?: (ms: number) => Promise<void>;
}

export type LocationPermissionState = 'granted' | 'ask' | 'blocked';

/**
 * 'blocked' means the user denied location and chose "don't ask again": Android will not show the
 * prompt again, so the only way forward is the system settings screen.
 */
export function locationPermissionState(permission: {
  granted: boolean;
  canAskAgain?: boolean | undefined;
}): LocationPermissionState {
  if (permission.granted) return 'granted';
  return permission.canAskAgain === false ? 'blocked' : 'ask';
}

export const LOCATION_BLOCKED_MESSAGE =
  'Location is turned off for this app. Turn it on in Settings to use your current position.';

const round5 = (value: number) => Number(value.toFixed(5));

/** Resolves to `fallback` when `promise` is slow or fails; never rejects and never hangs. */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
  wait: (ms: number) => Promise<void> = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
): Promise<T> {
  return Promise.race([promise.catch(() => fallback), wait(ms).then(() => fallback)]);
}

function toCoordinates(
  position: DevicePosition,
  source: DeviceCoordinates['source'],
): DeviceCoordinates {
  return {
    lat: round5(position.coords.latitude),
    lng: round5(position.coords.longitude),
    accuracyM:
      typeof position.coords.accuracy === 'number' && Number.isFinite(position.coords.accuracy)
        ? position.coords.accuracy
        : null,
    source,
  };
}

/** Resolves to coordinates, or null when permission is denied or no position can be found. */
export async function getDeviceCoordinates(
  api: DeviceLocationApi,
  options: DeviceLocationOptions = {},
): Promise<DeviceCoordinates | null> {
  const {
    freshTimeoutMs = 10_000,
    recentMaxAgeMs = 2 * 60_000,
    recentAccuracyM = 150,
    staleMaxAgeMs = 15 * 60_000,
    highAccuracy = 4,
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = options;

  const permission = await api.requestForegroundPermissionsAsync();
  if (!permission.granted) return null;

  const safeLastKnown = async (maxAge: number, requiredAccuracy?: number) => {
    try {
      return await api.getLastKnownPositionAsync(
        requiredAccuracy === undefined ? { maxAge } : { maxAge, requiredAccuracy },
      );
    } catch {
      return null;
    }
  };

  const recent = await safeLastKnown(recentMaxAgeMs, recentAccuracyM);
  if (recent) return toCoordinates(recent, 'recent');

  const fresh = await Promise.race([
    api.getCurrentPositionAsync({ accuracy: highAccuracy }).catch(() => null),
    wait(freshTimeoutMs).then(() => null),
  ]);
  if (fresh) return toCoordinates(fresh, 'fresh');

  const stale = await safeLastKnown(staleMaxAgeMs);
  return stale ? toCoordinates(stale, 'stale') : null;
}
