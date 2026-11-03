import { Platform, Vibration } from 'react-native';
import {
  RING_MAX_MS,
  createRingController,
  type RingEndReason,
  type RingPlayer,
  type RingSound,
} from './ring-controller';

const PRIORITY_CALL = 2;

function loadAsset(sound: RingSound): unknown {
  // Metro needs static require paths, so each sound is listed explicitly.
  return sound === 'ringback'
    ? require('@/assets/sfx/ringback.wav')
    : require('@/assets/sfx/ringtone.wav');
}

function createNativePlayer(sound: RingSound): RingPlayer | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createAudioPlayer, setAudioModeAsync } = require('expo-audio');
    const asset = loadAsset(sound);
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

function createWebPlayer(sound: RingSound): RingPlayer | null {
  try {
    if (typeof window === 'undefined' || !(window as { Audio?: unknown }).Audio) return null;
    const asset = loadAsset(sound) as string | { default?: string; uri?: string };
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
  createPlayer: (sound) =>
    Platform.OS === 'web' ? createWebPlayer(sound) : createNativePlayer(sound),
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

/**
 * Ringback the caller hears while the other side's phone is ringing. Stops when the call is
 * answered or ended, or after 30 seconds. No vibration.
 */
export function startCallRingback(callId: string, ringingUntil?: string | null): () => void {
  return controller.start({
    id: `callback:${callId}`,
    priority: PRIORITY_CALL,
    sound: 'ringback',
    until: ringingUntil,
  });
}
