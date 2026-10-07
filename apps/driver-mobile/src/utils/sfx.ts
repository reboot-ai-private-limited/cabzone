import { Platform } from 'react-native';

// ---------------------------------------------------------
// Types & State
// ---------------------------------------------------------

let webAudioCtx: any = null;
let webAudioBuffer: any = null;
let isWebAudioLoading = false;

const WEB_POOL_SIZE = 8;
const webAudioPool: any[] = [];
let webPoolIdx = 0;

const NATIVE_POOL_SIZE = 8;
const nativePlayers: any[] = [];
let nativePoolIdx = 0;
let isNativeAudioLoaded = false;

// ---------------------------------------------------------
// Helper: Resolve asset URI cross-platform
// ---------------------------------------------------------
function resolveAssetUrl(asset: any): string {
  if (!asset) return '';
  if (typeof asset === 'string') return asset;
  if (asset && typeof asset.default === 'string') return asset.default;
  if (asset && typeof asset.uri === 'string') return asset.uri;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Image } = require('react-native');
    const resolved = Image?.resolveAssetSource?.(asset);
    if (resolved?.uri) return resolved.uri;
  } catch {
    // ignore
  }
  return '';
}

// ---------------------------------------------------------
// Native Player Pool Initialization (iOS / Android)
// ---------------------------------------------------------
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createAudioPlayer, preload } = require('expo-audio');
    const asset = require('@/assets/sfx/popSound.mp3');

    // Preload into native audio cache for immediate zero-latency readiness
    if (typeof preload === 'function') {
      preload(asset).catch(() => {});
    }

    if (createAudioPlayer) {
      for (let i = 0; i < NATIVE_POOL_SIZE; i++) {
        const player = createAudioPlayer(asset);
        if (player) {
          player.volume = 0.75;
          nativePlayers.push(player);
        }
      }
      isNativeAudioLoaded = nativePlayers.length > 0;
    }
  } catch {
    // Native module not linked in current runtime (e.g. standard Expo Go fallback)
  }
}

// ---------------------------------------------------------
// Web Low-Latency Preload (Web Audio API + HTML5 Pool)
// ---------------------------------------------------------
export const initPopSound = async (): Promise<void> => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const asset = require('@/assets/sfx/popSound.mp3');
      const uri = resolveAssetUrl(asset);

      // 1. Web Audio API (decoded buffer in memory = 0ms latency)
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass && !webAudioBuffer && !isWebAudioLoading) {
        isWebAudioLoading = true;
        if (!webAudioCtx) {
          webAudioCtx = new AudioCtxClass();
        }
        if (uri) {
          const res = await fetch(uri);
          const arrayBuffer = await res.arrayBuffer();
          webAudioBuffer = await webAudioCtx.decodeAudioData(arrayBuffer);
        }
        isWebAudioLoading = false;
      }

      // 2. Pre-warmed HTML5 Audio element pool fallback
      if (webAudioPool.length === 0 && uri && (window as any).Audio) {
        for (let i = 0; i < WEB_POOL_SIZE; i++) {
          const el = new (window as any).Audio(uri);
          el.preload = 'auto';
          el.volume = 0.75;
          webAudioPool.push(el);
        }
      }
    } catch {
      isWebAudioLoading = false;
    }
  }
};

// Warm up immediately upon module import
if (Platform.OS === 'web') {
  initPopSound().catch(() => {});
}

// ---------------------------------------------------------
// Low-Latency Pop Sound Trigger
// ---------------------------------------------------------
export const playPopSound = async (): Promise<void> => {
  try {
    // 1. Web: 0ms Web Audio buffer or preloaded HTML5 pool
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        // Fast-path: Web Audio API (zero seek, zero decode delay)
        if (webAudioCtx && webAudioBuffer) {
          if (webAudioCtx.state === 'suspended') {
            webAudioCtx.resume().catch(() => {});
          }
          const source = webAudioCtx.createBufferSource();
          source.buffer = webAudioBuffer;
          const gain = webAudioCtx.createGain();
          gain.gain.value = 0.75;
          source.connect(gain);
          gain.connect(webAudioCtx.destination);
          source.start(0);
          return;
        }

        // Secondary fast-path: pre-buffered HTML5 audio pool
        if (webAudioPool.length > 0) {
          const audio = webAudioPool[webPoolIdx % webAudioPool.length];
          webPoolIdx = (webPoolIdx + 1) % webAudioPool.length;
          audio.currentTime = 0;
          audio.play().catch(() => {});
          return;
        }

        // Tertiary fallback: create audio and trigger init
        const asset = require('@/assets/sfx/popSound.mp3');
        const uri = resolveAssetUrl(asset);
        if (uri && (window as any).Audio) {
          const audio = new (window as any).Audio(uri);
          audio.volume = 0.75;
          audio.play().catch(() => {});
          initPopSound().catch(() => {});
        }
      }
      return;
    }

    // 2. Native (iOS / Android): Round-robin player pool without blocking seekTo
    if (isNativeAudioLoaded && nativePlayers.length > 0) {
      const player = nativePlayers[nativePoolIdx % nativePlayers.length];
      nativePoolIdx = (nativePoolIdx + 1) % nativePlayers.length;

      // Rewind asynchronously in the background so play() triggers instantly
      if (player.currentTime > 0) {
        player.seekTo(0).catch(() => {});
      }
      player.play();
    }
  } catch {
    // Fail silently on muted or restricted device
  }
};

// ---------------------------------------------------------
// Readiness gate: lets callers start visuals and audio together
// ---------------------------------------------------------
const isPopSoundReady = (): boolean => {
  if (Platform.OS === 'web') {
    return !!webAudioBuffer || webAudioPool.length > 0;
  }
  if (!isNativeAudioLoaded) return true; // no native audio available -> never block UI
  return nativePlayers.every((p) => p?.isLoaded);
};

/** Resolves once audio is decoded/loaded (or after timeoutMs, so UI is never blocked). */
export const whenPopSoundReady = (timeoutMs = 700): Promise<void> =>
  new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (isPopSoundReady() || Date.now() - start >= timeoutMs) {
        resolve();
        return;
      }
      setTimeout(tick, 25);
    };
    tick();
  });

// ---------------------------------------------------------
// Web autoplay unlock: browsers keep AudioContext suspended until a user gesture
// ---------------------------------------------------------
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const unlock = () => {
    if (webAudioCtx && webAudioCtx.state === 'suspended') {
      webAudioCtx.resume().catch(() => {});
    }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  window.addEventListener('touchstart', unlock);
}
