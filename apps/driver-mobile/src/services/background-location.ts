import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { dispatchApi, isApiError } from './api';
import { getAccessToken } from './storage';

const TASK_NAME = 'cabzone-driver-location';

TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  if (error || AppState.currentState === 'active') return;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  const fix = locations?.at(-1);
  if (!fix || Date.now() - fix.timestamp > 30_000 || (fix.coords.accuracy ?? 0) > 200) return;
  const token = await getAccessToken();
  if (!token) return;
  const coords = {
    lat: fix.coords.latitude,
    lng: fix.coords.longitude,
    heading: fix.coords.heading,
    speedMps: fix.coords.speed,
  };
  try {
    await dispatchApi.updateLocation(token, coords);
  } catch (requestError) {
    if (isApiError(requestError) && requestError.status === 409) {
      await dispatchApi.setStatus(token, 'ONLINE', { lat: coords.lat, lng: coords.lng }).catch(() => {});
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
