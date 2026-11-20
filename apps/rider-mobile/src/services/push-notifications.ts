import * as Device from 'expo-device';
import {
  AndroidAudioContentType,
  AndroidAudioUsage,
  AndroidImportance,
  AndroidNotificationVisibility,
} from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

if (Platform.OS !== 'web' && typeof Notifications?.setNotificationHandler === 'function') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        // Incoming calls and ride offers already ring in-app while the app is open; every other
        // notification keeps its normal sound so updates and chat are not silenced.
        const type = (notification.request.content.data as { type?: unknown } | null)?.type;
        const ringsInApp = type === 'ride.call.incoming' || type === 'ride.offer.created';
        return {
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: !ringsInApp,
          shouldSetBadge: false,
        };
      },
    });
  } catch {
    // no-op in Expo Go / web
  }
}

/**
 * Creates every Android notification channel. Safe to call repeatedly. Runs at startup (not only after
 * push registration) so a server push never lands on a channel the device has not created yet.
 * Android fixes a channel's sound at creation, so changing a ring sound needs a new channel id.
 */
export async function ensureNotificationChannelsAsync(): Promise<void> {
  if (Platform.OS !== 'android' || typeof Notifications?.setNotificationChannelAsync !== 'function') return;
  await Notifications.setNotificationChannelAsync('ride-calls', {
    name: 'Ride calls',
    importance: AndroidImportance.HIGH,
  });
  await Notifications.setNotificationChannelAsync('ride-updates', {
    name: 'Ride updates',
    importance: AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
  });
  // Android fixes a channel's sound at creation, so the ringing channel is a new id.
  // The 29s ring plays in full when a driver calls while the app is closed.
  await Notifications.setNotificationChannelAsync('ride-calls-ring', {
    name: 'Incoming ride calls (ringing)',
    importance: AndroidImportance.MAX,
    sound: 'ring_long.wav',
    vibrationPattern: [0, 700, 500, 700, 500, 700, 500, 700, 500, 700, 500, 700],
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    audioAttributes: {
      usage: AndroidAudioUsage.NOTIFICATION_RINGTONE,
      contentType: AndroidAudioContentType.SONIFICATION,
    },
    bypassDnd: false,
  });
}

if (Platform.OS === 'android') {
  void ensureNotificationChannelsAsync().catch(() => {});
}

export async function registerForPushAsync(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  try {
    await ensureNotificationChannelsAsync();
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return null;

    // Android: FCM token. iOS: raw APNs device token. Both are sent straight from our API.
    const { data } = await Notifications.getDevicePushTokenAsync();
    return typeof data === 'string' && data.trim() ? data.trim() : null;
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
    return Notifications.addPushTokenListener((devicePushToken) => {
      const candidate =
        typeof devicePushToken?.data === 'string' ? devicePushToken.data.trim() : '';
      if (!candidate) return;
      onToken(candidate);
    });
  } catch {
    return { remove: () => {} };
  }
}
