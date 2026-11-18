import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// 1. Verify Metro push-stub & native-voice-stub resolution never leaks stubs into EAS, --push, or production builds (C05)
const driverMetro = require(path.resolve(__dirname, '../metro.config.js'));
const riderMetro = require(path.resolve(__dirname, '../../rider-mobile/metro.config.js'));

for (const [label, metro] of [
  ['driver-mobile', driverMetro],
  ['rider-mobile', riderMetro],
]) {
  assert.equal(
    metro.shouldUsePushStub({}),
    true,
    `${label}: plain local Expo Go start should use push stub`,
  );
  assert.equal(
    metro.shouldUsePushStub({ EXPO_USE_PUSH: '1' }),
    false,
    `${label}: EXPO_USE_PUSH=1 must resolve real expo-notifications`,
  );
  assert.equal(
    metro.shouldUsePushStub({ EAS_BUILD: 'true' }),
    false,
    `${label}: EAS_BUILD=true must never resolve push stub`,
  );
  assert.equal(
    metro.shouldUsePushStub({ NODE_ENV: 'production' }),
    false,
    `${label}: NODE_ENV=production must never resolve push stub`,
  );
  assert.equal(
    metro.shouldUsePushStub({ NODE_ENV: 'production', EXPO_USE_PUSH: '0' }),
    true,
    `${label}: explicit EXPO_USE_PUSH=0 override should force stub`,
  );

  const mockContext = {
    resolveRequest: (_ctx, moduleName) => ({ filePath: `/real/${moduleName}`, type: 'sourceFile' }),
  };

  delete process.env.EXPO_USE_PUSH;
  for (const voicePkg of ['@livekit/react-native', '@livekit/react-native-webrtc', 'react-native-callkeep']) {
    const stubbed = metro.resolver.resolveRequest(mockContext, voicePkg, 'android');
    assert.ok(
      stubbed.filePath.endsWith('native-voice-stub.js'),
      `${label}: ${voicePkg} must resolve to native-voice-stub.js in Expo Go`,
    );
  }

  process.env.EXPO_USE_PUSH = '1';
  for (const voicePkg of ['@livekit/react-native', '@livekit/react-native-webrtc', 'react-native-callkeep']) {
    const real = metro.resolver.resolveRequest(mockContext, voicePkg, 'android');
    assert.equal(
      real.filePath,
      `/real/${voicePkg}`,
      `${label}: ${voicePkg} must resolve to real module when EXPO_USE_PUSH=1`,
    );
  }
  delete process.env.EXPO_USE_PUSH;
}

// 2. Verify app.config.js dynamic EAS projectId and googleServicesFile wiring without secrets (C05)
const driverAppConfig = require(path.resolve(__dirname, '../app.config.js'));
const riderAppConfig = require(path.resolve(__dirname, '../../rider-mobile/app.config.js'));

process.env.DRIVER_EAS_PROJECT_ID = '00000000-0000-4000-8000-000000000111';
process.env.RIDER_EAS_PROJECT_ID = '00000000-0000-4000-8000-000000000222';
const resolvedDriver = driverAppConfig({ config: {} });
const resolvedRider = riderAppConfig({ config: {} });

assert.equal(resolvedDriver.extra.eas.projectId, '00000000-0000-4000-8000-000000000111');
assert.equal(resolvedDriver.android.package, 'in.cabzone.driver');
assert.equal(resolvedDriver.ios.bundleIdentifier, 'in.cabzone.driver');
assert.equal(resolvedRider.extra.eas.projectId, '00000000-0000-4000-8000-000000000222');
assert.equal(resolvedRider.android.package, 'in.cabzone.rider');
assert.equal(resolvedRider.ios.bundleIdentifier, 'in.cabzone.rider');

delete process.env.DRIVER_EAS_PROJECT_ID;
delete process.env.RIDER_EAS_PROJECT_ID;

// 3. Verify Android background location permissions & refreshed-token 409 recovery guard (C09)
assert.ok(
  resolvedDriver.android.permissions.includes('android.permission.ACCESS_BACKGROUND_LOCATION'),
);
assert.ok(
  resolvedDriver.android.permissions.includes('android.permission.FOREGROUND_SERVICE_LOCATION'),
);

const bgSource = fs.readFileSync(
  path.resolve(__dirname, '../src/services/background-location.ts'),
  'utf8',
);
assert.match(
  bgSource,
  /const latestToken = \(await getAccessToken\(\)\) \?\? token;/,
  'background-location.ts must re-read latest SecureStore token before 409 setStatus recovery',
);

console.log('platform-push-location checks passed (driver-mobile + rider-mobile).');
