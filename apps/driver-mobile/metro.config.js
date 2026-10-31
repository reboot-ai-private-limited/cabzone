const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const originalResolveRequest = config.resolver.resolveRequest;

// expo-notifications and native WebRTC/CallKeep modules throw at module-init time in Expo Go (SDK 53+)
// because DevicePushTokenAutoRegistration.fx.js and @livekit/react-native-webrtc require native bridges.
// Development builds, EAS builds, and production bundles resolve the real native modules.
function shouldUsePushStub(env = process.env) {
  if (env.EXPO_USE_PUSH === '1') return false;
  if (env.EXPO_USE_PUSH === '0') return true;
  if (env.EAS_BUILD === 'true' || env.NODE_ENV === 'production') return false;
  return true;
}

const EXPO_NOTIFICATIONS_STUB = path.resolve(__dirname, 'src/lib/expo-notifications-stub.js');
const NATIVE_VOICE_STUB = path.resolve(__dirname, 'src/lib/native-voice-stub.js');
const NATIVE_VOICE_MODULES = new Set([
  '@livekit/react-native',
  '@livekit/react-native-webrtc',
  'react-native-callkeep',
]);

function isNativeVoiceModule(moduleName) {
  return (
    NATIVE_VOICE_MODULES.has(moduleName) ||
    moduleName.startsWith('@livekit/react-native/') ||
    moduleName.startsWith('@livekit/react-native-webrtc/') ||
    moduleName.startsWith('react-native-callkeep/')
  );
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (shouldUsePushStub()) {
    if (moduleName === 'expo-notifications') {
      return { filePath: EXPO_NOTIFICATIONS_STUB, type: 'sourceFile' };
    }
    if (isNativeVoiceModule(moduleName)) {
      return { filePath: NATIVE_VOICE_STUB, type: 'sourceFile' };
    }
  }

  // Map relative .js imports inside TypeScript packages (like @cabzone/contracts) to .ts/.tsx
  if (moduleName.endsWith('.js') && (moduleName.startsWith('./') || moduleName.startsWith('../'))) {
    try {
      const withoutExt = moduleName.slice(0, -3);
      return (originalResolveRequest || context.resolveRequest)(context, withoutExt, platform);
    } catch {
      // continue to standard resolution
    }
  }
  return (originalResolveRequest || context.resolveRequest)(context, moduleName, platform);
};

config.shouldUsePushStub = shouldUsePushStub;
module.exports = config;
