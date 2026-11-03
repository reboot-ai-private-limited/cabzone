import { Platform, Vibration } from 'react-native';
import {
  RING_MAX_MS,
  createRingController,
  type RingEndReason,
  type RingPlayer,
} from './ring-controller';

/** Calls outrank ride offers: an incoming call interrupts an offer ring, never the reverse. */
const PRIORITY_OFFER = 1;
const PRIORITY_CALL = 2;

function createNativePlayer(): RingPlayer | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createAudioPlayer, setAudioModeAsync } = require('expo-audio');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const asset = require('@/assets/sfx/ringtone.wav');
    // Ring even when the phone is on silent: a missed offer is a lost ride.
    void setAudioModeAsync?.({ playsInSilentMode: true, shouldPlayInBackground: false })?.catch?.(
      () => {},
    );
    const player = createAudioPlayer(asset);
    player.loop = true;
    player.volume = 1;
    return {
      play: () => {
        if (typeof player.seekTo === 'function') void player.seekTo(0)?.catch?.(() => {});
        player.play();
      },
      pause: () => player.pause(),
    };
  } catch {
    // Native audio is not linked in this runtime (for example Expo Go): vibration still runs.
    return null;
  }
}

function createWebPlayer(): RingPlayer | null {
  try {
    if (typeof window === 'undefined' || !(window as { Audio?: unknown }).Audio) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const asset = require('@/assets/sfx/ringtone.wav');
    const uri =
      typeof asset === 'string' ? asset : (asset?.default ?? asset?.uri ?? '');
    if (!uri) return null;
    const el = new (window as unknown as { Audio: new (src: string) => HTMLAudioElement }).Audio(
      uri,
    );
    el.loop = true;
    return {
      play: () => {
        el.currentTime = 0;
        void el.play().catch(() => {});
      },
      pause: () => el.pause(),
    };
  } catch {
    return null;
  }
}

const controller = createRingController({
  createPlayer: () => (Platform.OS === 'web' ? createWebPlayer() : createNativePlayer()),
  vibrate: (pattern) => {
    if (Platform.OS === 'web') return;
    if (pattern) Vibration.vibrate([...pattern], true);
    else Vibration.cancel();
  },
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
});

export { RING_MAX_MS };
export type { RingEndReason };

/**
 * Rings for a new ride offer until the driver accepts or ignores it, the offer expires, or
 * 30 seconds pass. Returns a stop function; call it when the offer is resolved.
 */
export function startOfferRing(rideId: string, expiresAt?: string | null): () => void {
  return controller.start({ id: `offer:${rideId}`, priority: PRIORITY_OFFER, until: expiresAt });
}

/** Rings for an incoming in-app call until it is answered, declined, ends, or 30 seconds pass. */
export function startCallRing(
  callId: string,
  ringingUntil?: string | null,
  onEnd?: (reason: RingEndReason) => void,
): () => void {
  return controller.start({
    id: `call:${callId}`,
    priority: PRIORITY_CALL,
    until: ringingUntil,
    onEnd,
  });
}

export function stopAllRinging(): void {
  controller.stop();
}
