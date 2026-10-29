import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { AndroidImportance } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

if (Platform.OS !== 'web' && typeof Notifications?.setNotificationHandler === 'function') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // no-op in Expo Go / web
  }
}

export async function registerForPushAsync(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('ride-updates', {
        name: 'Ride updates',
        importance: AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
    if (!projectId) {
      console.warn(
        'Push registration requires an EAS project ID. Configure the Rider Android build first.',
      );
      return null;
    }
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (error) {
    console.warn('Rider push registration failed:', error);
    return null;
  }
}

export function listenForPushTokenChanges(
  onToken: (token: string) => void,
): { remove: () => void } {
  if (
    Platform.OS === 'web' ||
    !Device.isDevice ||
    typeof Notifications?.addPushTokenListener !== 'function'
  ) {
    return { remove: () => {} };
  }
  try {
    return Notifications.addPushTokenListener(({ data }) => onToken(data));
  } catch {
    return { remove: () => {} };
  }
}
