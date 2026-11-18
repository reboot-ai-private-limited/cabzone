import { locationLabel } from './location-names';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import {
  AndroidAudioContentType,
  AndroidAudioUsage,
  AndroidImportance,
  AndroidNotificationVisibility,
} from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// SDK 53 removed remote push from Expo Go and web does not support native push handlers — guard so dev reloads don't crash.
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
 * Asks for permission and returns this device's Expo push token, or null when push is not
 * available (web, simulator, permission denied, or Expo Go without a project id).
 */
const EXPO_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

function resolveEasProjectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
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
  await Notifications.setNotificationChannelAsync('ride-offers', {
    name: 'Ride offers',
    importance: AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
  });
  // Android fixes a channel's sound at creation, so the ringing channel is a new id.
  // The 29s ring plays in full when a ride offer arrives while the app is closed.
  await Notifications.setNotificationChannelAsync('ride-offers-ring', {
    name: 'Ride offers (ringing)',
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

    const projectId = resolveEasProjectId();
    if (!projectId) {
      console.warn(
        'Push registration requires an EAS project ID. Configure the Driver Android build first.',
      );
      return null;
    }
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (error) {
    console.warn('Push registration failed:', error);
    return null;
  }
}

export function listenForPushTokenChanges(onToken: (token: string) => void): {
  remove: () => void;
} {
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

function playWebChime(freq = 880): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.25, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch {
    // ignore audio autoplay restrictions
  }
}

export async function notifyIncomingOfferLocal(offer: {
  rideId: string;
  proposedFarePaise: number;
  vehicleCategory: string;
  pickup?: { address?: string | null };
}): Promise<void> {
  const rupees = Math.round(offer.proposedFarePaise / 100);
  const pickupLabel = locationLabel(offer.pickup?.address, 'Nearby passenger');
  playWebChime(784);
  if (Platform.OS === 'web' || typeof Notifications?.scheduleNotificationAsync !== 'function') {
    return;
  }
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `New ${offer.vehicleCategory} Ride · ₹${rupees}`,
        body: `Pickup: ${pickupLabel}. Tap to accept or counter.`,
        sound: true,
        data: { type: 'ride.offer.created', rideId: offer.rideId },
      },
      trigger: null,
    });
  } catch {
    // ignore notification error on unconfigured simulator
  }
}

export async function notifyCounterResponseLocal(
  rideId: string,
  accepted: boolean,
  farePaise: number,
): Promise<void> {
  const rupees = Math.round(farePaise / 100);
  playWebChime(accepted ? 987 : 523);
  if (Platform.OS === 'web' || typeof Notifications?.scheduleNotificationAsync !== 'function') {
    return;
  }
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: accepted ? `Counter ₹${rupees} Accepted!` : `Counter ₹${rupees} Declined`,
        body: accepted
          ? 'Passenger accepted your fare. Head to the pickup location now.'
          : 'Passenger declined your counter-offer. You can accept their fare or send another counter.',
        sound: true,
        data: { type: accepted ? 'ride.driver.assigned' : 'ride.fare.counter_rejected', rideId },
      },
      trigger: null,
    });
  } catch {
    // ignore notification error
  }
}
