const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const originalResolveRequest = config.resolver.resolveRequest;

// expo-notifications throws at module-init time in Expo Go (SDK 53+) because
// DevicePushTokenAutoRegistration.fx.js calls addPushTokenListener unconditionally.
// We redirect the import to a safe stub; the stub exports the same API surface as
// no-ops so all call sites compile and run without changes.
// In a real dev-build or production build, remove this block or set EXPO_USE_PUSH=1.
const EXPO_NOTIFICATIONS_STUB = path.resolve(__dirname, 'src/lib/expo-notifications-stub.js');
const usePushStub = process.env.EXPO_USE_PUSH !== '1';

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (usePushStub && moduleName === 'expo-notifications') {
    return { filePath: EXPO_NOTIFICATIONS_STUB, type: 'sourceFile' };
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

module.exports = config;
