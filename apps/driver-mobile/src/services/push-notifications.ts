import { locationLabel } from './location-names';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { AndroidImportance } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// SDK 53 removed remote push from Expo Go and web does not support native push handlers — guard so dev reloads don't crash.
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

/**
 * Asks for permission and returns this device's Expo push token, or null when push is not
 * available (web, simulator, permission denied, or Expo Go without a project id).
 */
export async function registerForPushAsync(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('ride-offers', {
        name: 'Ride offers',
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
    return Notifications.addPushTokenListener(({ data }) => onToken(data));
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
