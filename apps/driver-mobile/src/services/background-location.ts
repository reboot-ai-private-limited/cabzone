import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { dispatchApi, isApiError } from './api';
import { getAccessToken } from './storage';

const TASK_NAME = 'cabzone-driver-location';
const MAX_FIX_AGE_MS = 30_000;
const MAX_HORIZONTAL_ACCURACY_M = 200;

export function isEligibleBackgroundFix(
  fix: Pick<Location.LocationObject, 'timestamp' | 'coords'> | undefined,
  nowMs = Date.now(),
): fix is Pick<Location.LocationObject, 'timestamp' | 'coords'> {
  if (!fix) return false;
  if (nowMs - fix.timestamp > MAX_FIX_AGE_MS) return false;
  if ((fix.coords.accuracy ?? 0) > MAX_HORIZONTAL_ACCURACY_M) return false;
  return Number.isFinite(fix.coords.latitude) && Number.isFinite(fix.coords.longitude);
}

/** expo-location reports -1 for unavailable heading/speed; the API rejects negatives. */
export function sanitizeMotion(
  heading: number | null | undefined,
  speed: number | null | undefined,
) {
  return {
    heading:
      heading != null && Number.isFinite(heading) && heading >= 0 && heading <= 360
        ? heading
        : null,
    speedMps: speed != null && Number.isFinite(speed) && speed >= 0 && speed <= 100 ? speed : null,
  };
}

TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  if (error || AppState.currentState === 'active') return;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  const fix = locations?.at(-1);
  if (!isEligibleBackgroundFix(fix)) return;
  const token = await getAccessToken();
  if (!token) return;
  const coords = {
    lat: fix.coords.latitude,
    lng: fix.coords.longitude,
    ...sanitizeMotion(fix.coords.heading, fix.coords.speed),
  };
  try {
    await dispatchApi.updateLocation(token, coords);
  } catch (requestError) {
    if (isApiError(requestError) && requestError.status === 409) {
      // Re-read token in case updateLocation refreshed an expired access token before receiving 409.
      const latestToken = (await getAccessToken()) ?? token;
      await dispatchApi
        .setStatus(latestToken, 'ONLINE', { lat: coords.lat, lng: coords.lng })
        .catch(() => {});
      return;
    }
    // The API client refreshes expired access tokens once; a remaining error is left for foreground recovery.
  }
});

export async function startBackgroundLocation(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if ((await Location.getBackgroundPermissionsAsync()).status !== 'granted') return false;
  if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME)) return true;
  await Location.startLocationUpdatesAsync(TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 15_000,
    distanceInterval: 10,
    foregroundService: {
      notificationTitle: 'Cabzone Driver is online',
      notificationBody: 'Location is shared to receive rides and track an active trip.',
      killServiceOnDestroy: true,
    },
  });
  return true;
}

export async function stopBackgroundLocation(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(TASK_NAME);
  }
}
