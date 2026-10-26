import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { AndroidImportance } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

if (Platform.OS !== 'web' && typeof Notifications.setNotificationHandler === 'function') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function registerForPushAsync(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('ride-updates', {
        name: 'Ride updates',
        importance: AndroidImportance.HIGH,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (error) {
    console.warn('Push registration failed:', error);
    return null;
  }
}

export function listenForPushTokenChanges(onToken: (token: string) => void) {
  if (Platform.OS === 'web' || !Device.isDevice) return { remove: () => {} };
  return Notifications.addPushTokenListener(({ data }) => onToken(data));
}
