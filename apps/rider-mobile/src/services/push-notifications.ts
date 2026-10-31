import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { AndroidImportance } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const EXPO_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

function resolveEasProjectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

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

    const projectId = resolveEasProjectId();
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

export async function getNativeCallPushTokenAsync(): Promise<{
  token: string;
  platform: 'android' | 'ios';
  transport: 'FCM_CALL' | 'APNS_VOIP';
} | null> {
  if (Platform.OS === 'web' || !Device.isDevice || typeof Notifications?.getDevicePushTokenAsync !== 'function') {
    return null;
  }
  try {
    const res = await Notifications.getDevicePushTokenAsync();
    const raw = typeof res?.data === 'string' ? res.data.trim() : '';
    if (!raw || EXPO_PUSH_TOKEN_PATTERN.test(raw)) return null;
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    return { token: raw, platform, transport: platform === 'ios' ? 'APNS_VOIP' : 'FCM_CALL' };
  } catch {
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
    return Notifications.addPushTokenListener((devicePushToken) => {
      const candidate =
        typeof devicePushToken?.data === 'string' ? devicePushToken.data.trim() : '';
      if (EXPO_PUSH_TOKEN_PATTERN.test(candidate)) {
        onToken(candidate);
        return;
      }
      const projectId = resolveEasProjectId();
      if (!projectId || typeof Notifications?.getExpoPushTokenAsync !== 'function') {
        return;
      }
      void Notifications.getExpoPushTokenAsync({ projectId, devicePushToken })
        .then(({ data }) => {
          if (typeof data === 'string' && EXPO_PUSH_TOKEN_PATTERN.test(data.trim())) {
            onToken(data.trim());
          }
        })
        .catch(() => {
          // Initial registration runs via registerForPushAsync(); ignore transient listener exchange errors.
        });
    });
  } catch {
    return { remove: () => {} };
  }
}
